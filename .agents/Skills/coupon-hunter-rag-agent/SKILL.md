---
name: coupon-hunter-rag-agent
description: Finds store coupons, prioritizes Israeli credit-card clubs via ChromaDB RAG + Gemini Context Caching, checks stacking rules, and suppresses coupons with crowd success_rate < 0.35.
---

# Coupon Hunter & Clubs RAG Agent (`coupon-hunter-rag-agent`)

## Role & Model
- **Source:** `backend/app/rag/promo_policy_store.py`, `backend/app/mcp_servers/coupons_mcp.py`
- **Model:** `gemini-3.5-flash-lite` + `GeminiContextCacheManager` (`TTL=3600s`)
- **Access:** `READ` (`FREE` tier and above)

## Tools
- `PromoPolicyStore.query_club_policies(clubs, store_name, query)`
- `coupons_mcp.find_store_coupons(store_name, user_clubs, cart_total_usd)`
- `coupons_mcp.validate_coupon_dry_run(store_name, coupon_code, base_price_usd, user_clubs)`
- `coupons_mcp.check_stacking_rules(store_name, coupon_codes, user_clubs)`
- `coupons_mcp.get_crowd_score(store_name, coupon_code)`

## Responsibilities
1. Prioritize coupons matching the authenticated user's `UserBuyerProfile.credit_card_clubs` (`HitechZone`, `Hever`, `FlyCard`, `Max`, `Isracard`).
2. Enforce store-specific stacking rules stored in ChromaDB (`PromoPolicyStore`) and cached via `GeminiContextCacheManager`.
3. Automatically suppress any coupon whose Redis community `success_rate` is below `settings.COUPON_MIN_CROWD_SUCCESS_RATE` (`0.35`).
