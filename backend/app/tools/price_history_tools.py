"""Deterministic 90-180 day price history analytics & Fake Discount auditor."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.api.schemas import PriceHistoryPointOut, PriceHistoryResponse
from backend.app.core.config import settings
from backend.app.db.models import PriceHistory


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _query_points(
    db: Session,
    product_id: str,
    store_name: str | None = None,
) -> list[PriceHistory]:
    query = db.query(PriceHistory).filter(
        or_(
            PriceHistory.product_id == product_id,
            PriceHistory.sku == product_id,
        )
    )
    if store_name:
        query = query.filter(PriceHistory.store_name.ilike(store_name))
    return query.order_by(PriceHistory.recorded_at.asc()).all()


def _compute_audit_metrics(
    rows: list[PriceHistory],
    current_price_usd: float | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    cutoff_90d = now - timedelta(days=90)
    cutoff_30d = now - timedelta(days=30)

    if not rows:
        cur = round(float(current_price_usd or 0.0), 2)
        return {
            "avg_90d_usd": cur,
            "baseline_31_90d_usd": cur,
            "historical_low_usd": cur,
            "max_30d_pre_sale_usd": cur,
            "current_price_usd": cur,
            "spike_pct": 0.0,
            "fake_discount_flag": False,
            "reason": "No historical price records found; treating current price as baseline.",
        }

    normalized = [(_to_utc(r.recorded_at), r) for r in rows]
    points_90d = [r for ts, r in normalized if ts >= cutoff_90d]
    if not points_90d:
        points_90d = [r for _, r in normalized]

    avg_90d_usd = round(sum(r.price_usd for r in points_90d) / len(points_90d), 2)
    historical_low_usd = round(min(r.price_usd for _, r in normalized), 2)

    cur_price = round(
        float(current_price_usd) if current_price_usd is not None else normalized[-1][1].price_usd,
        2,
    )

    baseline_rows = [
        r for ts, r in normalized if cutoff_90d <= ts < cutoff_30d
    ]
    if not baseline_rows:
        baseline_rows = [r for ts, r in normalized if ts < cutoff_30d]
    if not baseline_rows:
        baseline_rows = points_90d

    baseline_31_90d_usd = round(
        sum(r.price_usd for r in baseline_rows) / len(baseline_rows), 2
    )

    recent_30d = [r for ts, r in normalized if ts >= cutoff_30d]
    if recent_30d:
        max_30d_pre_sale_usd = round(
            max(
                max(r.price_usd, r.original_listed_usd or r.price_usd)
                for r in recent_30d
            ),
            2,
        )
    else:
        max_30d_pre_sale_usd = baseline_31_90d_usd

    if baseline_31_90d_usd > 0:
        spike_ratio = max(0.0, (max_30d_pre_sale_usd - baseline_31_90d_usd) / baseline_31_90d_usd)
    else:
        spike_ratio = 0.0
    spike_pct = round(spike_ratio * 100.0, 2)

    fake_discount_flag = (
        spike_ratio > settings.FAKE_DISCOUNT_SPIKE_THRESHOLD
        and cur_price < max_30d_pre_sale_usd
    )

    if fake_discount_flag:
        reason = (
            f"FAKE_DISCOUNT: Price spiked +{spike_pct:.1f}% to ${max_30d_pre_sale_usd:.2f} "
            f"within 30 days above the 31-90d baseline (${baseline_31_90d_usd:.2f}) "
            f"before dropping to ${cur_price:.2f}."
        )
    else:
        reason = (
            f"GENUINE_PRICING: No >{int(settings.FAKE_DISCOUNT_SPIKE_THRESHOLD * 100)}% "
            f"pre-sale spike detected (31-90d baseline ${baseline_31_90d_usd:.2f}, "
            f"30d peak ${max_30d_pre_sale_usd:.2f})."
        )

    return {
        "avg_90d_usd": avg_90d_usd,
        "baseline_31_90d_usd": baseline_31_90d_usd,
        "historical_low_usd": historical_low_usd,
        "max_30d_pre_sale_usd": max_30d_pre_sale_usd,
        "current_price_usd": cur_price,
        "spike_pct": spike_pct,
        "fake_discount_flag": fake_discount_flag,
        "reason": reason,
    }


def get_price_history_90d(
    db: Session,
    product_id: str,
    store_name: str | None = None,
) -> PriceHistoryResponse:
    """Return 90-180d price history points and fake-discount metrics for a product."""
    rows = _query_points(db, product_id=product_id, store_name=store_name)
    metrics = _compute_audit_metrics(rows)
    sku = rows[0].sku if rows else product_id
    resolved_product_id = rows[0].product_id if rows else product_id

    points = [
        PriceHistoryPointOut(
            store_name=r.store_name,
            price_usd=round(r.price_usd, 2),
            original_listed_usd=round(r.original_listed_usd, 2)
            if r.original_listed_usd is not None
            else None,
            recorded_at=_to_utc(r.recorded_at),
        )
        for r in rows
    ]

    return PriceHistoryResponse(
        product_id=resolved_product_id,
        sku=sku,
        avg_90d_usd=metrics["avg_90d_usd"],
        historical_low_usd=metrics["historical_low_usd"],
        max_30d_pre_sale_usd=metrics["max_30d_pre_sale_usd"],
        current_price_usd=metrics["current_price_usd"],
        fake_discount_flag=metrics["fake_discount_flag"],
        spike_pct=metrics["spike_pct"],
        points=points,
    )


def audit_fake_discount(
    db: Session,
    product_id: str,
    store_name: str,
    current_price_usd: float,
) -> dict[str, Any]:
    """Audit whether a store offer exhibits a pre-sale >15% artificial price spike."""
    rows = _query_points(db, product_id=product_id, store_name=store_name)
    if not rows:
        # Fallback to any store history for the same product if store-specific is missing
        rows = _query_points(db, product_id=product_id, store_name=None)

    metrics = _compute_audit_metrics(rows, current_price_usd=current_price_usd)
    return {
        "product_id": product_id,
        "store_name": store_name,
        **metrics,
    }
