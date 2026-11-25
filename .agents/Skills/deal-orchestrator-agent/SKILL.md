---
name: deal-orchestrator-agent
description: Main Agno Team orchestrator coordinating parallel deal discovery, auditing, deterministic landed-cost ranking, user-isolated long-term memory, and SSE streaming on gemini-3.5-flash-lite.
---

# Deal Orchestrator Agent (`deal-orchestrator-agent`)

## Role & Model
- **Framework / Entrypoint:** `backend/app/agents/deal_orchestrator.py:create_dealscout_team`
- **Model:** `gemini-3.5-flash-lite` (`settings.GEMINI_ORCHESTRATOR_MODEL`, temperature `0.2`)
- **Streaming Protocol:** FastAPI SSE (`POST /api/v1/deals/search` via `stream_deal_search`)

## Responsibilities
1. Emit an immediate `agent_step` SSE event (`<50ms` TTFT) upon receiving a `DealSearchRequest` + verified `UserContext`.
2. Load user-isolated preferences (`UserBuyerProfile` + `UserMemoryManager.get_user_preferences`) strictly scoped to `ctx.user_id`.
3. Fan out concurrently (`asyncio.gather`) to Store Search (`ecommerce_mcp`), Coupon Hunter (`coupons_mcp` + `PromoPolicyStore`), Price History Audit (`audit_fake_discount`), Review & Compatibility Audit (`audit_voltage_and_reviews`), and Guardrails (`sanitize_external_text`, `check_seller_trust`).
4. Enforce **SPEC 5.3 Decision Matrix**:
   - `BLOCKED_SCAM`: exclude from ranked results & write `AuditLog`.
   - `FAKE_DISCOUNT`: emit `warning_flag` and penalize rank below genuine deals.
   - `INCOMPATIBLE_SPEC`: attach explicit warning (e.g. `110V` for `IL`) and emit `warning_flag`.
   - `GREAT_DEAL` / `FAIR_PRICE`: rank by ascending `total_landed_ils`.
5. Never calculate prices, VAT, or FX via LLM — always call `calculate_landed_cost_il` and `inject_affiliate_params`.
6. Record `COUPON` / `FAKE_SALE_AVOIDED` savings in `UserSavingsLedger` and token/cost metrics via `TelemetryRecorder`.
