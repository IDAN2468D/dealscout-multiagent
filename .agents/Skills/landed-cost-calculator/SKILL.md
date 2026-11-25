---
name: landed-cost-calculator
description: 100% pure Python deterministic calculator for FX conversion, verified coupon deduction, shipping, and Israel 18% personal-import VAT above $75.00 net item value.
---

# Landed Cost Calculator (`landed-cost-calculator`)

## Role & Engine
- **Source:** `backend/app/tools/landed_cost_tools.py`
- **Engine:** **100% Deterministic Python** (zero LLM arithmetic allowed)

## Tool
- `calculate_landed_cost_il(base_price_usd, shipping_usd, coupon_discount_usd, applied_coupons, ship_to_country, fx_rate_ils) -> LandedCostBreakdown`

## Deterministic Rules
1. Fetch `USD -> ILS` exchange rate from Redis (`get_fx_rate`), defaulting to `3.65` (`settings.DEFAULT_USD_TO_ILS`).
2. `net_item_usd = max(0.0, round(base_price_usd - coupon_discount_usd, 2))`
3. If `ship_to_country == "IL"`:
   - `net_item_usd <= $75.00` -> `vat_applied = False`, `vat_amount_usd = 0.0`
   - `net_item_usd > $75.00` -> `vat_applied = True`, `vat_amount_usd = round((net_item_usd + shipping_usd) * 0.18, 2)`
4. `total_landed_usd = round(net_item_usd + shipping_usd + vat_amount_usd, 2)`
5. `total_landed_ils = round(total_landed_usd * fx_rate, 2)`
