"""Deals search SSE, multimodal matching, cart split, watchlist, coupon feedback & HITL routes."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.app.agents.deal_orchestrator import run_deal_pipeline, stream_deal_search
from backend.app.agents.multimodal_matcher import extract_sku_from_media
from backend.app.api.schemas import (
    CartSplitRequest,
    CartSplitResponse,
    CheckoutApprovalRequest,
    CheckoutApprovalResponse,
    CheckoutInitiateRequest,
    CouponFeedbackRequest,
    CouponFeedbackResponse,
    DealCandidate,
    DealSearchRequest,
    MatchFromImageRequest,
    MatchFromImageResponse,
    PriceDropTriggerRequest,
    PriceHistoryResponse,
    UserContext,
    WatchlistCreateRequest,
    WatchlistItemResponse,
)
from backend.app.core.config import settings
from backend.app.core.redis_client import check_rate_limit, record_coupon_vote
from backend.app.core.security import get_current_user_context, require_tier
from backend.app.db.models import (
    AuditLog,
    CouponFeedback,
    PendingApproval,
    UserSavingsLedger,
    Watchlist,
)
from backend.app.db.session import get_db
from backend.app.mcp_servers import notify_mcp
from backend.app.streaming.kafka_price_watcher import kafka_price_watcher
from backend.app.tools.cart_split_optimizer_tools import optimize_cart_tax_split
from backend.app.tools.price_history_tools import get_price_history_90d

router = APIRouter(prefix="/api/v1", tags=["deals"])

WATCHLIST_LIMITS: dict[str, int | None] = {
    "FREE": 3,
    "PRO": 50,
    "ADMIN": None,
}


@router.post("/deals/search")
async def search_deals_sse(
    payload: DealSearchRequest,
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Stream 9-agent deal search progress and deterministic results over SSE."""
    allowed, _remaining, reset_in = check_rate_limit(ctx.user_id, ctx.tier)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily/hourly search quota exceeded for {ctx.tier} tier. Reset in {reset_in}s.",
            headers={"Retry-After": str(reset_in)},
        )

    async def _event_generator():
        async for evt in stream_deal_search(request=payload, ctx=ctx, db=db):
            event_name = evt.get("event", "message")
            data_json = json.dumps(evt.get("data", {}), ensure_ascii=False, default=str)
            yield f"event: {event_name}\ndata: {data_json}\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/deals/match-from-image", response_model=MatchFromImageResponse)
async def match_deals_from_image_or_url(
    payload: MatchFromImageRequest,
    ctx: UserContext = Depends(require_tier("PRO")),
    db: Session = Depends(get_db),
) -> MatchFromImageResponse:
    """PRO-only multimodal Vision / URL Context product identifier + deal matcher."""
    if not payload.product_url and not payload.image_base64 and not payload.hint_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one of product_url, image_base64, or hint_text.",
        )

    extracted = extract_sku_from_media(payload)
    search_query = str(
        extracted.get("search_query")
        or extracted.get("detected_sku")
        or extracted.get("detected_model")
        or "Sony WH-1000XM5"
    )
    pipeline_out = await run_deal_pipeline(
        request=DealSearchRequest(query=search_query, use_saved_profile=True),
        ctx=ctx,
        db=db,
    )
    matched_deals = [DealCandidate(**d) for d in pipeline_out.get("deals", [])]

    return MatchFromImageResponse(
        detected_brand=str(extracted.get("detected_brand", "Unknown")),
        detected_model=str(extracted.get("detected_model", "Unknown")),
        detected_sku=str(extracted.get("detected_sku", "UNKNOWN")),
        confidence=float(extracted.get("confidence", 0.85)),
        extraction_method=str(extracted.get("extraction_method", "deterministic")),
        matched_deals=matched_deals,
    )


@router.post("/cart/optimize-split", response_model=CartSplitResponse)
def optimize_cart_split_endpoint(
    payload: CartSplitRequest,
    ctx: UserContext = Depends(require_tier("PRO")),
    db: Session = Depends(get_db),
) -> CartSplitResponse:
    """PRO-only deterministic multi-item $75 Israel VAT cart-split optimizer."""
    result = optimize_cart_tax_split(payload)

    if result.saved_ils > 0:
        db.add(
            UserSavingsLedger(
                user_id=ctx.user_id,
                source_type="TAX_SPLIT",
                saved_ils=result.saved_ils,
                saved_usd=result.saved_usd,
                description=f"{payload.store_name}: {result.explanation[:200]}",
                reference_sku=payload.items[0].sku if payload.items else None,
            )
        )
        db.commit()

    return result


@router.post("/coupons/{code}/feedback", response_model=CouponFeedbackResponse)
def submit_coupon_feedback(
    code: str,
    payload: CouponFeedbackRequest,
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> CouponFeedbackResponse:
    """Record crowd-verified coupon feedback in PostgreSQL and Redis."""
    clean_code = code.strip().upper()
    if not clean_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Coupon code cannot be empty.",
        )

    fb = CouponFeedback(
        coupon_code=clean_code,
        store_name=payload.store_name.strip(),
        user_id=ctx.user_id,
        worked=payload.worked,
        cart_total_usd=payload.cart_total_usd,
    )
    db.add(fb)
    db.commit()

    rate, total_votes = record_coupon_vote(
        store_name=payload.store_name,
        coupon_code=clean_code,
        worked=payload.worked,
    )

    return CouponFeedbackResponse(
        coupon_code=clean_code,
        store_name=payload.store_name,
        worked=payload.worked,
        success_rate=rate,
        total_votes=total_votes,
        suppressed=rate < settings.COUPON_MIN_CROWD_SUCCESS_RATE,
    )


@router.get("/watchlist", response_model=list[WatchlistItemResponse])
def list_watchlist(
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> list[WatchlistItemResponse]:
    """List Watchlist items strictly owned by the authenticated user."""
    rows = (
        db.query(Watchlist)
        .filter(Watchlist.user_id == ctx.user_id, Watchlist.is_active.is_(True))
        .order_by(Watchlist.created_at.desc())
        .all()
    )
    return [WatchlistItemResponse.model_validate(r) for r in rows]


@router.post(
    "/watchlist",
    response_model=WatchlistItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_watchlist_item(
    payload: WatchlistCreateRequest,
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> WatchlistItemResponse:
    """Add an item to the user's Watchlist while enforcing tier limits."""
    limit = WATCHLIST_LIMITS.get(ctx.tier.upper(), 3)
    if limit is not None:
        active_count = (
            db.query(Watchlist)
            .filter(Watchlist.user_id == ctx.user_id, Watchlist.is_active.is_(True))
            .count()
        )
        if active_count >= limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Watchlist limit reached for {ctx.tier} tier (max {limit}). Upgrade Required.",
            )

    item = Watchlist(
        user_id=ctx.user_id,
        product_id=payload.product_id,
        sku=payload.sku,
        product_title=payload.product_title,
        store_name=payload.store_name,
        target_price_ils=payload.target_price_ils,
        target_price_usd=payload.target_price_usd,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return WatchlistItemResponse.model_validate(item)


@router.delete("/watchlist/{item_id}")
def delete_watchlist_item(
    item_id: str,
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Delete a Watchlist item strictly enforcing user ownership (anti-IDOR)."""
    item = db.query(Watchlist).filter(Watchlist.id == item_id).first()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Watchlist item not found.",
        )

    if item.user_id != ctx.user_id:
        db.add(
            AuditLog(
                user_id=ctx.user_id,
                event_type="IDOR_WATCHLIST_DELETE_BLOCKED",
                severity="CRITICAL",
                resource_type="watchlist",
                resource_id=item_id,
                details_json={"owner_user_id": item.user_id, "actor_user_id": ctx.user_id},
            )
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: cannot delete another user's watchlist item.",
        )

    db.delete(item)
    db.commit()
    return {"deleted": True, "id": item_id}


@router.get("/deals/{product_id}/history", response_model=PriceHistoryResponse)
def get_deal_price_history(
    product_id: str,
    store_name: str | None = Query(default=None),
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> PriceHistoryResponse:
    """Return 90-180d price history and Fake Discount spike metrics."""
    _ = ctx
    return get_price_history_90d(db=db, product_id=product_id, store_name=store_name)


@router.post(
    "/deals/checkout/initiate",
    response_model=CheckoutApprovalResponse,
    status_code=status.HTTP_201_CREATED,
)
def initiate_hitl_checkout(
    payload: CheckoutInitiateRequest,
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> CheckoutApprovalResponse:
    """Pause checkout in PENDING_APPROVAL and dispatch HITL approval card."""
    card = notify_mcp.dispatch_checkout_approval_card(
        ctx=ctx,
        resource_owner_id=ctx.user_id,
        product_id=payload.product_id,
        sku=payload.sku,
        product_title=payload.product_title,
        store_name=payload.store_name,
        affiliate_url=payload.affiliate_url,
        total_landed_usd=payload.total_landed_usd,
        total_landed_ils=payload.total_landed_ils,
        applied_coupons=payload.applied_coupons,
        db=db,
    )
    return CheckoutApprovalResponse(
        approval_id=card["approval_id"],
        user_id=ctx.user_id,
        status="PENDING_APPROVAL",
        product_title=payload.product_title,
        store_name=payload.store_name,
        total_landed_ils=round(payload.total_landed_ils, 2),
        affiliate_url=payload.affiliate_url,
        message=card["message"],
    )


@router.post("/deals/approve-checkout", response_model=CheckoutApprovalResponse)
def approve_or_reject_checkout(
    payload: CheckoutApprovalRequest,
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> CheckoutApprovalResponse:
    """Explicit owner sign-off for a PENDING_APPROVAL HITL checkout request."""
    approval = (
        db.query(PendingApproval)
        .filter(PendingApproval.id == payload.approval_id)
        .first()
    )
    if approval is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Checkout approval request not found.",
        )

    if approval.user_id != ctx.user_id:
        db.add(
            AuditLog(
                user_id=ctx.user_id,
                event_type="IDOR_CHECKOUT_APPROVAL_BLOCKED",
                severity="CRITICAL",
                resource_type="pending_approval",
                resource_id=approval.id,
                details_json={
                    "owner_user_id": approval.user_id,
                    "actor_user_id": ctx.user_id,
                    "attempted_decision": payload.decision,
                },
            )
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: cannot approve another user's checkout request.",
        )

    approval.status = payload.decision
    approval.user_note = payload.user_note
    approval.decided_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            user_id=ctx.user_id,
            event_type=f"CHECKOUT_{payload.decision}",
            severity="INFO",
            resource_type="pending_approval",
            resource_id=approval.id,
            details_json={
                "sku": approval.sku,
                "store_name": approval.store_name,
                "total_landed_ils": approval.total_landed_ils,
                "user_note": payload.user_note,
            },
        )
    )
    db.commit()
    db.refresh(approval)

    msg = (
        "Checkout approved by authenticated owner. Ready to open affiliate link."
        if approval.status == "APPROVED"
        else "Checkout rejected by owner."
    )
    return CheckoutApprovalResponse(
        approval_id=approval.id,
        user_id=approval.user_id,
        status=approval.status,  # type: ignore[arg-type]
        product_title=approval.product_title,
        store_name=approval.store_name,
        total_landed_ils=approval.total_landed_ils,
        affiliate_url=approval.affiliate_url,
        user_note=approval.user_note,
        message=msg,
    )


@router.post("/deals/price-drop")
async def trigger_price_drop_demo(
    payload: PriceDropTriggerRequest,
    ctx: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Publish to Kafka `price-drop-events`, dispatch alerts to `deal-alerts`, and return user-scoped status."""
    await kafka_price_watcher.publish_price_drop(
        product_id=payload.product_id,
        sku=payload.sku,
        store_name=payload.store_name,
        new_price_usd=payload.new_price_usd,
    )
    alerts = await kafka_price_watcher.handle_price_drop_event(
        db=db,
        product_id=payload.product_id,
        sku=payload.sku,
        store_name=payload.store_name,
        new_price_usd=payload.new_price_usd,
    )
    visible_alerts = (
        alerts
        if ctx.role.upper() == "ADMIN"
        else [a for a in alerts if a.get("user_id") == ctx.user_id]
    )
    return {
        "event": "price-drop-events",
        "product_id": payload.product_id,
        "sku": payload.sku,
        "store_name": payload.store_name,
        "new_price_usd": payload.new_price_usd,
        "total_alerts_dispatched": len(alerts),
        "user_alerts": visible_alerts,
    }
