"""FastMCP WRITE server for price alerts and HITL checkout approval cards.

Strictly enforces ownership (``resource_owner_id == ctx.user_id`` -> IDOR protection)
and tier-based notification channels (FREE -> email only; PRO/ADMIN -> email, telegram, slack).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from mcp.server.fastmcp import FastMCP
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.db.models import AuditLog, PendingApproval

mcp = FastMCP("notify-mcp")

_DISPATCH_HISTORY: list[dict[str, Any]] = []


def _extract_user_fields(ctx: Any) -> tuple[str, str, list[str], str | None]:
    if isinstance(ctx, dict):
        user_id = str(ctx.get("user_id") or "")
        tier = str(ctx.get("tier") or "FREE").upper()
        bp = ctx.get("buyer_profile") or {}
        channels = list(bp.get("notification_channels") or ["email"])
        telegram_chat_id = bp.get("telegram_chat_id")
        return user_id, tier, channels, telegram_chat_id

    user_id = str(getattr(ctx, "user_id", "") or "")
    tier = str(getattr(ctx, "tier", "FREE") or "FREE").upper()
    bp = getattr(ctx, "buyer_profile", None)
    channels = list(getattr(bp, "notification_channels", ["email"]) or ["email"]) if bp else ["email"]
    telegram_chat_id = getattr(bp, "telegram_chat_id", None) if bp else None
    return user_id, tier, channels, telegram_chat_id


def _assert_ownership(ctx_user_id: str, resource_owner_id: str) -> None:
    if not ctx_user_id or str(resource_owner_id) != str(ctx_user_id):
        raise PermissionError("IDOR blocked: ownership mismatch")


def _resolve_allowed_channels(tier: str, requested_channels: list[str]) -> list[str]:
    if tier == "FREE":
        return ["email"]
    allowed = [ch for ch in requested_channels if ch in {"email", "telegram", "slack"}]
    return allowed or ["email"]


def _persist_audit_log(
    db: Any | None,
    user_id: str,
    event_type: str,
    resource_type: str,
    resource_id: str,
    details: dict[str, Any],
    severity: str = "INFO",
) -> None:
    if db is None:
        return
    entry = AuditLog(
        user_id=user_id,
        event_type=event_type,
        severity=severity,
        resource_type=resource_type,
        resource_id=resource_id,
        details_json=details,
    )
    db.add(entry)
    db.commit()


def _dispatch_live_or_mock(
    channels: list[str],
    payload: dict[str, Any],
    telegram_chat_id: str | None = None,
) -> list[dict[str, Any]]:
    deliveries: list[dict[str, Any]] = []
    mode = settings.NOTIFY_MODE
    for channel in channels:
        status = "mock_sent"
        if mode == "live":
            try:
                import httpx

                if channel == "slack" and settings.SLACK_WEBHOOK_URL:
                    httpx.post(
                        settings.SLACK_WEBHOOK_URL,
                        json={"text": payload.get("summary", "DealScout Alert")},
                        timeout=2.0,
                    )
                    status = "live_sent"
                elif channel == "telegram" and settings.TELEGRAM_BOT_TOKEN and telegram_chat_id:
                    httpx.post(
                        f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
                        json={"chat_id": telegram_chat_id, "text": payload.get("summary", "DealScout Alert")},
                        timeout=2.0,
                    )
                    status = "live_sent"
                elif channel == "email":
                    status = "live_queued"
                else:
                    status = "mock_fallback_unconfigured"
            except Exception:
                status = "mock_fallback_error"

        deliveries.append({"channel": channel, "status": status})

    _DISPATCH_HISTORY.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "channels": channels,
            "deliveries": deliveries,
            "payload": payload,
        }
    )
    return deliveries


@mcp.tool()
def send_price_alert(
    ctx: Any,
    resource_owner_id: str,
    product_title: str,
    store_name: str,
    new_price_usd: float,
    new_price_ils: float | None = None,
    product_id: str = "",
    sku: str = "",
    db: Any = None,
) -> dict[str, Any]:
    """Send a price-drop alert strictly to the owning user across tier-allowed channels."""
    ctx_user_id, tier, requested_channels, telegram_chat_id = _extract_user_fields(ctx)
    _assert_ownership(ctx_user_id, resource_owner_id)

    channels = _resolve_allowed_channels(tier, requested_channels)
    ils_val = round(
        new_price_ils if new_price_ils is not None else float(new_price_usd) * settings.DEFAULT_USD_TO_ILS,
        2,
    )
    summary = (
        f"[DealScout Alert] {product_title} at {store_name} dropped to "
        f"${float(new_price_usd):.2f} (~₪{ils_val:.2f})"
    )
    deliveries = _dispatch_live_or_mock(
        channels=channels,
        payload={
            "user_id": ctx_user_id,
            "product_id": product_id,
            "sku": sku,
            "store_name": store_name,
            "new_price_usd": float(new_price_usd),
            "new_price_ils": ils_val,
            "summary": summary,
        },
        telegram_chat_id=telegram_chat_id,
    )

    _persist_audit_log(
        db=db,
        user_id=ctx_user_id,
        event_type="PRICE_ALERT_SENT",
        resource_type="watchlist",
        resource_id=product_id or sku or store_name,
        details={
            "store_name": store_name,
            "new_price_usd": float(new_price_usd),
            "new_price_ils": ils_val,
            "channels": channels,
            "notify_mode": settings.NOTIFY_MODE,
        },
    )

    return {
        "dispatched": True,
        "user_id": ctx_user_id,
        "tier": tier,
        "channels": channels,
        "deliveries": deliveries,
        "summary": summary,
    }


@mcp.tool()
def dispatch_checkout_approval_card(
    ctx: Any,
    resource_owner_id: str,
    product_id: str,
    sku: str,
    product_title: str,
    store_name: str,
    affiliate_url: str,
    total_landed_usd: float,
    total_landed_ils: float,
    applied_coupons: list[str] | None = None,
    db: Any = None,
) -> dict[str, Any]:
    """Create a PENDING_APPROVAL HITL checkout card strictly for the authenticated owner."""
    ctx_user_id, tier, requested_channels, telegram_chat_id = _extract_user_fields(ctx)
    _assert_ownership(ctx_user_id, resource_owner_id)

    channels = _resolve_allowed_channels(tier, requested_channels)
    coupons = list(applied_coupons or [])
    approval_id = str(uuid.uuid4())

    if db is not None:
        approval = PendingApproval(
            id=approval_id,
            user_id=ctx_user_id,
            product_id=product_id,
            sku=sku,
            product_title=product_title,
            store_name=store_name,
            affiliate_url=affiliate_url,
            total_landed_usd=round(float(total_landed_usd), 2),
            total_landed_ils=round(float(total_landed_ils), 2),
            applied_coupons_json=coupons,
            status="PENDING_APPROVAL",
        )
        db.add(approval)
        db.commit()

        _persist_audit_log(
            db=db,
            user_id=ctx_user_id,
            event_type="CHECKOUT_APPROVAL_DISPATCHED",
            resource_type="pending_approval",
            resource_id=approval_id,
            details={
                "product_id": product_id,
                "sku": sku,
                "store_name": store_name,
                "total_landed_usd": round(float(total_landed_usd), 2),
                "total_landed_ils": round(float(total_landed_ils), 2),
                "applied_coupons": coupons,
                "channels": channels,
            },
        )

    summary = (
        f"[HITL Checkout Approval Required] {product_title} ({store_name}) - "
        f"Landed: ₪{float(total_landed_ils):.2f} (${float(total_landed_usd):.2f}). "
        f"Approve via ID {approval_id}."
    )
    deliveries = _dispatch_live_or_mock(
        channels=channels,
        payload={
            "approval_id": approval_id,
            "user_id": ctx_user_id,
            "product_id": product_id,
            "store_name": store_name,
            "affiliate_url": affiliate_url,
            "summary": summary,
        },
        telegram_chat_id=telegram_chat_id,
    )

    return {
        "approval_id": approval_id,
        "user_id": ctx_user_id,
        "status": "PENDING_APPROVAL",
        "product_id": product_id,
        "sku": sku,
        "product_title": product_title,
        "store_name": store_name,
        "affiliate_url": affiliate_url,
        "total_landed_usd": round(float(total_landed_usd), 2),
        "total_landed_ils": round(float(total_landed_ils), 2),
        "applied_coupons": coupons,
        "channels": channels,
        "deliveries": deliveries,
        "message": "Checkout paused for mandatory human-in-the-loop approval.",
    }
