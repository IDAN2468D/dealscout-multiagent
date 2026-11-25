"""ADMIN-only RBAC routes for audit logs, Gemini token/cost telemetry, and tier management."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.schemas import AdminTierUpdateRequest, UserContext
from backend.app.core.redis_client import invalidate_buyer_profile
from backend.app.core.security import require_role
from backend.app.db.models import AuditLog, User, UserSearchHistory
from backend.app.db.session import get_db
from backend.app.observability.telemetry import telemetry_recorder
from backend.app.rag.promo_policy_store import GeminiContextCacheManager

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
