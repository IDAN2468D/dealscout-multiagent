# 📋 Copyable Master Prompt — DealScout AI (`dealscout-multiagent`) v2.1

העתק את הפרומפט הבא ישירות לתוך **Antigravity / Cursor / Claude Code** כדי להקים ולממש את הפרויקט מקצה לקצה לפי `.agents/PRD.md`, `.agents/SPEC.md` ו-`.agents/PLAN.md`:

```markdown
You are a Principal AI Systems Architect and Senior Back End AI Engineer.
Your mission is to scaffold and implement the production-grade SaaS backend: "dealscout-multiagent" (DealScout AI) — an autonomous E-Commerce Deal Finder, Coupon Verifier, Fake-Discount Detector, and Smart Tax-Split Optimizer powered by Google's `gemini-3.5-flash-lite`, Agno Multi-Agent orchestration, FastMCP servers, RAG, Elasticsearch, Kafka, and JWT/RBAC authentication.

Strictly adhere to Spec-Driven Development (SDD) based on `.agents/PRD.md`, `.agents/SPEC.md`, `.agents/PLAN.md`, `.agents/AGENTS.md`, and `.agents/agents.json`. Write clean, complete, production-ready Python code with zero placeholders or `TODO`s.

==================================================
1. CORE AI & TECH STACK
==================================================
- Primary LLM: Google `gemini-3.5-flash-lite` via `google-genai>=1.15.0` and `agno>=2.6.0` (`agno.models.google.Gemini`).
  - Configure dynamic model IDs in `config.py` (`GEMINI_ORCHESTRATOR_MODEL`, `GEMINI_SUBAGENT_MODEL`, default `gemini-3.5-flash-lite`, `temperature=0.2`).
  - Leverage Gemini native features:
    1. `search=True` (Google Search Grounding) on `store-search-mcp-agent`.
    2. Multimodal Vision + `url_context=True` on `multimodal-product-matcher`.
    3. Gemini Context Caching for credit-card club policies and shared system instructions.
- Backend API: Python 3.11+, FastAPI, Pydantic v2, SSE (`StreamingResponse`).
- Auth & Multi-Tenancy: Argon2id password hashing, JWT Access Token (15m) + Refresh Token Rotation in HttpOnly Cookie (7d) with Redis revocation list, Google OAuth2, RBAC tiers (`FREE`, `PRO`, `ADMIN`), Redis sliding-window rate limiter, strict `user_id` isolation across API/DB/MCP to prevent IDOR.
- Data & Search: Elasticsearch 8.x (fuzzy product search), PostgreSQL 16 (users, buyer profiles, price history, watchlists, savings ledger, coupon feedback, pending approvals, audit & LLM token cost logs), Redis 7 (caching, crowd coupon score, FX rates, rate limits), ChromaDB (RAG for coupons & club policies + user long-term memory).
- MCP Layer: Official Python `mcp` SDK (`FastMCP`) for `ecommerce_mcp.py`, `coupons_mcp.py`, and `notify_mcp.py`.
- Streaming & Observability: Apache Kafka (`price-drop-events`, `deal-alerts`) + OpenTelemetry / Langfuse hooks for token/cost tracking.

==================================================
2. STRICT NON-NEGOTIABLE GUARDRAILS
==================================================
1. ZERO LLM MATH: Never allow `gemini-3.5-flash-lite` to calculate prices, coupon discounts, currency conversions, VAT, or cart splits. Always invoke deterministic Python tools (`landed_cost_tools.py`, `cart_split_optimizer_tools.py`).
2. ISRAEL IMPORT VAT RULE: When `ship_to_country == "IL"`, apply 0% VAT if net item value (after coupon, before shipping) <= $75.00; apply 18% VAT on (net item value + shipping) if net item value > $75.00.
3. PROMPT INJECTION DEFENSE: Run deterministic Python sanitization (`sanitize_external_text`) on all scraped product descriptions, reviews, and coupon posts BEFORE passing them to Gemini.
4. FAKE DISCOUNT & COMPATIBILITY AUDITS: Flag `FAKE_DISCOUNT` if pre-sale price rose >15% in the prior 30 days; flag `INCOMPATIBLE_SPEC` for 110V/US-plug appliances shipped to Israel or suspicious bot reviews; block sellers with `seller_trust_score < 70` (`BLOCKED_SCAM`).
5. HUMAN-IN-THE-LOOP (HITL): Never trigger cart/checkout mutations without pausing in `PENDING_APPROVAL` and receiving explicit sign-off from the authenticated owner (`approval.user_id == current_user.id`).
6. CROWD-VERIFIED COUPONS: Automatically suppress any coupon whose Redis community `success_rate` drops below 0.35.

==================================================
3. IMPLEMENTATION ORDER (FOLLOW PLAN.MD SPRINTS)
==================================================
1. Sprint 1: `docker-compose.yml`, `config.py`, `security.py`, PostgreSQL schemas, `auth_routes.py`, `user_routes.py`, RBAC & Redis rate limiting.
2. Sprint 2: `elasticsearch_catalog.py`, `landed_cost_tools.py`, `cart_split_optimizer_tools.py`, `price_history_tools.py`, `affiliate_tools.py`, and realistic seed data (5+ stores, valid/expired coupons, fake-discount case, 110V appliance case).
3. Sprint 3: `ecommerce_mcp.py`, `coupons_mcp.py`, `notify_mcp.py`, `promo_policy_store.py` (ChromaDB + Gemini Context Cache), `guardrails_tools.py`, `review_compatibility_tools.py`.
4. Sprint 4: `deal_orchestrator.py` (Agno Team powered by `gemini-3.5-flash-lite`), `multimodal-product-matcher`, long-term user memory, HITL approval gate, and `kafka_price_watcher.py`.
5. Sprint 5: `deal_routes.py` (SSE streaming, image match, cart split, coupon feedback, savings ledger), OpenTelemetry/Langfuse token cost logging, `Dockerfile`, and `.agents/scripts/verify_dealscout_suite.py` verifying every guardrail, auth rule, and deterministic calculation end-to-end.
```