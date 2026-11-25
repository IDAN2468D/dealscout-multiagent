"""100% Pure Python deterministic landed-cost & Israel 18% VAT calculator."""

from __future__ import annotations

from backend.app.api.schemas import LandedCostBreakdown
from backend.app.core.config import settings


def resolve_fx_rate_ils(fx_rate_ils: float | None = None) -> float:
    """Resolve USD->ILS exchange rate from explicit override, Redis cache, or config fallback."""
    if fx_rate_ils is not None and fx_rate_ils > 0:
        return float(fx_rate_ils)
    try:
        from backend.app.core.redis_client import get_fx_rate

        rate = float(get_fx_rate("USD", "ILS"))
        if rate > 0:
            return rate
    except Exception:
        pass
    return float(settings.DEFAULT_USD_TO_ILS)


def calculate_landed_cost_il(
    base_price_usd: float,
    shipping_usd: float,
    coupon_discount_usd: float = 0.0,
    applied_coupons: list[str] | None = None,
    ship_to_country: str = "IL",
    fx_rate_ils: float | None = None,
) -> LandedCostBreakdown:
    """Deterministically compute net price, Israel 18% VAT (> $75.00), and ILS landed total.

    Rules:
    - net_item_usd = max(0.0, round(base_price_usd - coupon_discount_usd, 2))
    - If ship_to_country == "IL":
      - net_item_usd <= 75.00 -> vat_applied = False, vat_amount_usd = 0.0
      - net_item_usd >  75.00 -> vat_applied = True, vat_amount_usd = round((net_item_usd + shipping_usd) * 0.18, 2)
    - Else: vat_applied = False, vat_amount_usd = 0.0
    - total_landed_usd = round(net_item_usd + shipping_usd + vat_amount_usd, 2)
    - total_landed_ils = round(total_landed_usd * fx_rate, 2)
    """
    base_rounded = round(float(base_price_usd), 2)
    discount_rounded = round(max(0.0, float(coupon_discount_usd)), 2)
    shipping_rounded = round(max(0.0, float(shipping_usd)), 2)

    net_item_usd = max(0.0, round(base_rounded - discount_rounded, 2))
    country = (ship_to_country or "IL").strip().upper()

    if country == "IL" and net_item_usd > settings.ISRAEL_VAT_EXEMPTION_USD:
        vat_applied = True
        vat_amount_usd = round((net_item_usd + shipping_rounded) * settings.ISRAEL_VAT_RATE, 2)
    else:
        vat_applied = False
        vat_amount_usd = 0.0

    total_landed_usd = round(net_item_usd + shipping_rounded + vat_amount_usd, 2)
    fx_rate = resolve_fx_rate_ils(fx_rate_ils)
    total_landed_ils = round(total_landed_usd * fx_rate, 2)

    return LandedCostBreakdown(
        base_price_usd=base_rounded,
        coupon_discount_usd=discount_rounded,
        applied_coupons=list(applied_coupons or []),
        shipping_usd=shipping_rounded,
        vat_applied=vat_applied,
        vat_amount_usd=vat_amount_usd,
        total_landed_usd=total_landed_usd,
        total_landed_ils=total_landed_ils,
    )
