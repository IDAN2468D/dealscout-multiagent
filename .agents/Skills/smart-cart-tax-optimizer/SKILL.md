---
name: smart-cart-tax-optimizer
description: 100% pure Python PRO-tier bin-packing optimizer comparing combined shipment vs splitting multi-item carts into <= $75.00 VAT-exempt packages for Israel imports.
---

# Smart Cart Tax-Split Optimizer (`smart-cart-tax-optimizer`)

## Role & Engine
- **Source:** `backend/app/tools/cart_split_optimizer_tools.py`
- **Engine:** **100% Deterministic Python** (`PRO` / `ADMIN` tier required via `POST /api/v1/cart/optimize-split`)

## Tool
- `optimize_cart_tax_split(request: CartSplitRequest, fx_rate_ils: float | None = None) -> CartSplitResponse`

## Deterministic Rules
1. Expand item quantities into unit items and evaluate exact partition search (`<= 14` units) or best-fit decreasing (`> 14` units).
2. For each candidate package, evaluate per-package shipping (`0.0` when subtotal `>= free_shipping_threshold_usd`, else `shipping_per_package_usd`) and Israel `18%` VAT (`subtotal > $75.00` when `ship_to_country == "IL"`).
3. Compare `SINGLE_SHIPMENT` baseline against optimal `SPLIT_PACKAGES` partition and return `saved_usd`, `saved_ils`, `packages`, and a clear explanation.
