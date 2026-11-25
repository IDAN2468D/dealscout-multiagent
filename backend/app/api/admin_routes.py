"""ADMIN-only RBAC routes for audit logs, Gemini token/cost telemetry, and tier management."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.schemas import AdminTierUpdateRequest, CouponModerationRequest, UserContext
from backend.app.core.config import settings
from backend.app.core.redis_client import (
    get_coupon_crowd_score,
    get_redis_client,
    invalidate_buyer_profile,
)
from backend.app.core.security import require_role
from backend.app.db.models import AuditLog, CouponFeedback, User, UserSearchHistory
from backend.app.db.session import get_db
from backend.app.observability.telemetry import telemetry_recorder
from backend.app.rag.promo_policy_store import GeminiContextCacheManager
from backend.app.search.seed_data import SEED_COUPONS, SEED_PRODUCTS

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    ctx: UserContext = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return security, IDOR, scam-block, and HITL audit logs (ADMIN only)."""
    _ = ctx
    rows = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "event_type": r.event_type,
            "severity": r.severity,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "details": r.details_json,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/telemetry")
def get_admin_telemetry(
    limit: int = Query(default=25, ge=1, le=200),
    ctx: UserContext = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return OpenTelemetry spans, Langfuse events, Context Cache & Gemini token cost ledger."""
    _ = ctx
    in_memory_summary = telemetry_recorder.get_summary(limit=limit)

    db_agg = db.query(
        func.count(UserSearchHistory.id),
        func.coalesce(func.sum(UserSearchHistory.input_tokens), 0),
        func.coalesce(func.sum(UserSearchHistory.output_tokens), 0),
        func.coalesce(func.sum(UserSearchHistory.cached_tokens), 0),
        func.coalesce(func.sum(UserSearchHistory.llm_cost_usd), 0.0),
    ).first()

    cache_status = GeminiContextCacheManager().get_cache_status()

    return {
        **in_memory_summary,
        "context_cache": cache_status,
        "db_totals": {
            "total_searches": int(db_agg[0] or 0) if db_agg else 0,
            "input_tokens": int(db_agg[1] or 0) if db_agg else 0,
            "output_tokens": int(db_agg[2] or 0) if db_agg else 0,
            "cached_tokens": int(db_agg[3] or 0) if db_agg else 0,
            "llm_cost_usd": round(float(db_agg[4] or 0.0), 8) if db_agg else 0.0,
        },
    }


@router.post("/users/{user_id}/tier")
def update_user_tier(
    user_id: str,
    payload: AdminTierUpdateRequest,
    ctx: UserContext = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Promote or change a user's SaaS tier (ADMIN only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.tier = payload.tier
    user.role = payload.tier
    db.add(
        AuditLog(
            user_id=ctx.user_id,
            event_type="ADMIN_TIER_UPDATED",
            severity="INFO",
            resource_type="user",
            resource_id=user.id,
            details_json={"new_tier": payload.tier, "admin_user_id": ctx.user_id},
        )
    )
    db.commit()
    invalidate_buyer_profile(user.id)
    return {"user_id": user.id, "email": user.email, "tier": user.tier, "role": user.role}


@router.get("/moderation")
def get_admin_moderation(
    ctx: UserContext = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return community coupon moderation table and blocked scam/injection sellers (ADMIN)."""
    _ = ctx
    seen_pairs: set[tuple[str, str]] = set()
    coupons_list: list[dict[str, Any]] = []

    for c in SEED_COUPONS:
        code = str(c["code"]).upper()
        store = str(c["store_name"])
        if (store.lower(), code) in seen_pairs:
            continue
        seen_pairs.add((store.lower(), code))
        rate, votes = get_coupon_crowd_score(store, code)
        coupons_list.append(
            {
                "code": code,
                "store_name": store,
                "success_rate": rate,
                "total_votes": votes,
                "suppressed": rate < settings.COUPON_MIN_CROWD_SUCCESS_RATE,
                "required_club": c.get("required_club"),
            }
        )

    fb_pairs = db.query(CouponFeedback.store_name, CouponFeedback.coupon_code).distinct().all()
    for store, code in fb_pairs:
        key = (str(store).lower(), str(code).upper())
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        rate, votes = get_coupon_crowd_score(str(store), str(code).upper())
        coupons_list.append(
            {
                "code": str(code).upper(),
                "store_name": str(store),
                "success_rate": rate,
                "total_votes": votes,
                "suppressed": rate < settings.COUPON_MIN_CROWD_SUCCESS_RATE,
                "required_club": None,
            }
        )

    coupons_list.sort(key=lambda x: x["success_rate"])

    blocked_rows = (
        db.query(AuditLog)
        .filter(AuditLog.event_type == "SCAM_OR_INJECTION_BLOCKED")
        .order_by(AuditLog.created_at.desc())
        .limit(50)
        .all()
    )
    blocked_sellers = [
        {
            "id": r.id,
            "product_id": r.resource_id,
            "store_name": (r.details_json or {}).get("store_name", ""),
            "seller_name": (r.details_json or {}).get("seller_name", "Unknown"),
            "seller_trust_score": (r.details_json or {}).get("seller_trust_score", 0),
            "threats": (r.details_json or {}).get("threats", []),
            "reason": (r.details_json or {}).get("reason", ""),
            "created_at": r.created_at.isoformat(),
        }
        for r in blocked_rows
    ]

    if not blocked_sellers:
        for p in SEED_PRODUCTS:
            for o in p.get("offers", []):
                if int(o.get("seller_trust_score", 100)) < settings.MIN_TRUST_SCORE_BLOCK:
                    blocked_sellers.append(
                        {
                            "id": f"seed-{p['sku']}-{o['store_name']}",
                            "product_id": p["product_id"],
                            "store_name": o["store_name"],
                            "seller_name": o["seller_name"],
                            "seller_trust_score": o["seller_trust_score"],
                            "threats": ["LOW_TRUST_SEED_SELLER"],
                            "reason": "Seller trust score below 70 threshold",
                            "created_at": "catalog-seed",
                        }
                    )

    return {"coupons": coupons_list, "blocked_sellers": blocked_sellers}


@router.post("/coupons/{code}/moderate")
def moderate_coupon(
    code: str,
    payload: CouponModerationRequest,
    ctx: UserContext = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Suppress or restore a coupon crowd score in Redis (ADMIN only)."""
    clean_code = code.strip().upper()
    store_norm = payload.store_name.strip().lower()
    key = f"coupon:crowd:{store_norm}:{clean_code}"
    client = get_redis_client()
    if payload.action == "suppress":
        client.hset(key, mapping={"total": "100", "success": "10"})
    else:
        client.hset(key, mapping={"total": "50", "success": "45"})

    rate, votes = get_coupon_crowd_score(payload.store_name, clean_code)
    db.add(
        AuditLog(
            user_id=ctx.user_id,
            event_type="ADMIN_COUPON_MODERATED",
            severity="INFO",
            resource_type="coupon",
            resource_id=clean_code,
            details_json={
                "store_name": payload.store_name,
                "action": payload.action,
                "new_success_rate": rate,
            },
        )
    )
    db.commit()
    return {
        "code": clean_code,
        "store_name": payload.store_name,
        "action": payload.action,
        "success_rate": rate,
        "total_votes": votes,
        "suppressed": rate < settings.COUPON_MIN_CROWD_SUCCESS_RATE,
    }
