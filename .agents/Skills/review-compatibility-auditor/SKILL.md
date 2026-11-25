---
name: review-compatibility-auditor
description: Audits electrical voltage/plug compatibility (110V US vs 230V Type-H Israel) and scans sanitized product reviews for bot-review bursts and unverified ratings.
---

# Review & Compatibility Auditor (`review-compatibility-auditor`)

## Role & Model
- **Source:** `backend/app/tools/review_compatibility_tools.py`, `backend/app/mcp_servers/ecommerce_mcp.py`
- **Model:** `gemini-3.5-flash-lite` + deterministic Python compatibility checks

## Tools
- `ecommerce_mcp.fetch_product_reviews(product_id, store_name, user_id)`
- `audit_voltage_and_reviews(specs, reviews, ship_to_country)`

## Responsibilities
1. When `ship_to_country == "IL"`, inspect `specs["voltage"]` and `specs["plug_type"]` and flag `INCOMPATIBLE_SPEC` (`INCOMPATIBLE_VOLTAGE_110V` / `INCOMPATIBLE_PLUG_US`) for 110V-only or US Type-A/B appliances lacking 220V–240V / dual-voltage support.
2. Ensure every review body is sanitized via `sanitize_external_text` before analysis.
3. Detect repetitive identical review bursts, coordinated timestamps, or low verified-purchase ratios (`bot_review_suspected`).
