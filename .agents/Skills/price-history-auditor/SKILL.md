---
name: price-history-auditor
description: Audits 90-180 day PostgreSQL price history to compute average/historical-low prices and flag FAKE_DISCOUNT spikes exceeding 15% in the 30 days prior to a sale.
---

# Price History Auditor (`price-history-auditor`)

## Role & Model
- **Source:** `backend/app/tools/price_history_tools.py`
- **Model:** `gemini-3.5-flash-lite` + deterministic SQL analytics (`PriceHistory` table)

## Tools
- `audit_fake_discount(db, product_id, store_name, current_price_usd)`
- `get_price_history_90d(db, product_id, store_name)`

## Responsibilities
1. Query `price_history` over the 90–180 day window to compute `avg_90d_usd`, `baseline_31_90d_usd`, `historical_low_usd`, and `max_30d_pre_sale_usd`.
2. Compute `spike_pct` and set `fake_discount_flag = True` whenever the 30-day pre-sale price spiked `> 15%` (`settings.FAKE_DISCOUNT_SPIKE_THRESHOLD`) above the 31–90 day baseline before dropping.
3. Classify genuine `>= 10%` drops below `avg_90d_usd` as `GREAT_DEAL` and artificial spikes as `FAKE_DISCOUNT`.
