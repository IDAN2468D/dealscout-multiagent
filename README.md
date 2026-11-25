# ⚡ DealScout AI (`dealscout-multiagent`) v2.1

**DealScout AI** is an autonomous, security-hardened **Multi-Agent E-Commerce Deal Finder, Coupon Verifier, Fake-Discount Detector, and Smart Import Tax-Split Optimizer** built with **FastAPI**, **Agno**, **Google `gemini-3.5-flash-lite`**, **FastMCP**, **Elasticsearch**, **ChromaDB**, **PostgreSQL**, **Redis**, and **Apache Kafka**, featuring a modern **RTL Hebrew dark-mode SaaS dashboard**.

---

## 🎯 Core Capabilities

* **9-Agent Orchestrator-Worker Team** powered by **`gemini-3.5-flash-lite`** (`google-genai`) with real-time **SSE Streaming** (`agent_step`, `tool_call`, `warning_flag`, `deal_ranked`, `final_report`).
* **100% Deterministic Financial Math (Zero LLM Math):** Currency conversion, coupon stacking, shipping, and Israel's **18% Import VAT (> $75.00 net item value)** are calculated purely in Python.
* **Smart Cart Tax-Split Optimizer (`PRO`):** Deterministic bin-packing/partition algorithm comparing single combined shipments against split packages under the `$75.00` VAT exemption threshold.
* **Multimodal Product Matcher (`PRO`):** Extract brand, model, and SKU from screenshots (`Vision`) or store URLs (`url_context=True`).
* **Fake Discount & 110V Compatibility Auditing:** Cross-checks 90–180 day PostgreSQL price history to catch >15% pre-sale price spikes (`FAKE_DISCOUNT`), flags 110V/US-plug appliances shipped to Israel (`INCOMPATIBLE_SPEC`), and detects bot reviews.
* **Prompt Injection & Anti-Scam Guardrails:** Deterministic Python sanitizer (`sanitize_external_text`) strips injection payloads before any text reaches Gemini, and blocks sellers with `seller_trust_score < 70` (`BLOCKED_SCAM`).
* **Crowd-Verified Coupons & Israeli Credit-Card Clubs:** ChromaDB RAG + Gemini Context Caching for **HitechZone**, **Hever**, **FlyCard**, and **Max**, backed by live Redis community voting (auto-suppressing coupons below `0.35` success rate).
* **Human-in-the-Loop (HITL) Checkout Gate:** Every checkout action pauses in `PENDING_APPROVAL` until explicitly `APPROVED` or `REJECTED` by the authenticated resource owner (`user_id`).
* **Kafka Price-Drop Alerts & Savings Ledger:** Asynchronous monitoring on `price-drop-events` / `deal-alerts` dispatching tier-aware alerts (Email / Telegram / Slack) strictly to each watchlist owner.

---

## 🏗️ Architecture Diagram

```text
[ RTL Hebrew Web UI (/) / Postman / API Clients ]
        │ (Authorization: Bearer JWT + SSE Stream)
        ▼
[ FastAPI Gateway: Argon2id + JWT/Refresh Rotation + RBAC + Redis Rate Limiter ]
        │ (Injects Verified `UserContext`: user_id, tier, buyer_profile)
        ├──────────────────────────────────────────────────────────┐
        ▼                                                          ▼
[ DealOrchestratorAgent (Agno + Gemini 3.5 Flash-Lite) ]   [ OTel + Langfuse Telemetry ]
        │ (Concurrent User-Scoped Delegation)
        ├───────────────┬───────────────┬───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼
[Store Search   [Multimodal     [Coupon Hunter  [Price History  [Review & Spec
 MCP Agent]      Matcher]        RAG + Cache]    Auditor]        Compatibility]
(ES+MCP+Search) (Vision+URL)    (Chroma+Redis)  (PostgreSQL)    (110V / Bots)
        │               │               │               │               │
        └───────────────┴───────────────┴───────────────┴───────────────┘
                                        │
                                        ▼
                [ Trust & Guardrails Anti-Scam / Injection Filter ]
                  (Deterministic Python Sanitizer + Gemini Audit)
                                        │
                                        ▼
             [ Deterministic Cost & Smart Cart Tax-Split Optimizer ]
           (Pure Python: FX + Coupons + Shipping + 18% VAT + Split Packs)
                                        │
               ┌────────────────────────┴────────────────────────┐
               ▼                                                 ▼
   [ Affiliate Injector + Savings Ledger ]          [ HITL Approval Gate ]
               │                                    (PENDING_APPROVAL -> User Sign-Off)
               ▼
   [ Kafka `price-drop-events` / `deal-alerts` ] ──► [ Notify MCP (Email / Telegram / Slack) ]
```

---

## 🤖 `gemini-3.5-flash-lite` Model Routing Table (9 Agents)

| # | Agent ID | Engine / Model | Capabilities & Tools | Tier |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `deal-orchestrator-agent` | `gemini-3.5-flash-lite` *(env: `GEMINI_ORCHESTRATOR_MODEL`)* | Concurrent delegation, `UserBuyerProfile`, Long-Term Memory, SSE | `FREE` |
| 2 | `multimodal-product-matcher` | `gemini-3.5-flash-lite` | Native **Vision** + **`url_context=True`** SKU/ASIN extraction | `PRO` |
| 3 | `store-search-mcp-agent` | `gemini-3.5-flash-lite` | Elasticsearch Fuzzy + `ecommerce_mcp` + **`search=True`** | `FREE` |
| 4 | `coupon-hunter-rag-agent` | `gemini-3.5-flash-lite` | ChromaDB + **Gemini Context Caching** + `coupons_mcp` + Redis Crowd Score | `FREE` |
| 5 | `price-history-auditor` | `gemini-3.5-flash-lite` + SQL | 90–180d PostgreSQL audit, `FAKE_DISCOUNT` (>15% pre-sale spike) | `FREE` |
| 6 | `review-compatibility-auditor` | `gemini-3.5-flash-lite` | Bot-review detection, `110V` / US plug `INCOMPATIBLE_SPEC` alert | `FREE` |
| 7 | `landed-cost-calculator` | **Deterministic Python** | Zero LLM math: FX, coupons, shipping, 18% IL VAT (`> $75.00`) | `FREE` |
| 8 | `smart-cart-tax-optimizer` | **Deterministic Python** | Bin-packing / subset search to split carts under `$75.00` | `PRO` |
| 9 | `trust-guardrails-hitl-agent` | Python Sanitizer + `gemini-3.5-flash-lite` | Prompt-injection strip, seller trust `< 70` block, HITL `notify_mcp` | `FREE` |

---

## 🛡️ Security & Guardrails Summary

* **Authentication & Token Hygiene:** `Argon2id` password hashing, short-lived `JWT` Access Tokens (`15m`), `7d` Refresh Tokens stored as SHA-256 hashes in PostgreSQL with `HttpOnly; SameSite=Lax` cookies, automatic **Token Rotation**, and **Reuse Detection** (revokes the entire `family_id` in DB & Redis).
* **RBAC & Rate Limiting:** Redis sliding-window rate limiter (`FREE`: 10 searches/day, max 3 watchlist items, email alerts only; `PRO`: 60/hour, 50 watchlist items, Tax-Split + Multimodal + Telegram/Slack; `ADMIN`: unlimited + `/admin/telemetry`).
* **Strict Multi-Tenancy (Zero IDOR):** Every DB query, ChromaDB preference lookup, Watchlist mutation, HITL approval, and `notify_mcp` call enforces `resource.user_id == ctx.user_id`.
* **No PAN Storage:** `PUT /api/v1/users/me/profile` accepts credit-card **club names only** (`HitechZone`, `Hever`, `FlyCard`, `Max`) and rejects 13–19 digit card numbers with **HTTP 422**.

---

## 🚀 Quick Start

### Option A: Local `.venv` Development (Fastest for Evaluation)

> Works cleanly with SQLite + `fakeredis` + in-memory ES/Chroma fallbacks when Docker containers aren't running, or connects to Docker infra automatically when running.

```powershell
# 1. Activate virtual environment (Windows PowerShell)
cd C:\Users\kazam\Desktop\App\dealscout-multiagent
.\.venv\Scripts\Activate.ps1

# 2. Configure environment (copy .env.example -> .env and optionally set GOOGLE_API_KEY)
copy .env.example .env

# 3. Install dependencies (if not already installed)
pip install -r backend/requirements.txt

# 4. Run database migrations (optional if using auto-init on startup)
alembic -c backend/alembic.ini upgrade head

# 5. Start the FastAPI server + RTL Hebrew Web UI on port 8020
uvicorn backend.app.main:app --host 0.0.0.0 --port 8020 --reload
```

Open **http://localhost:8020/** in your browser for the RTL Hebrew SaaS UI, or **http://localhost:8020/docs** for OpenAPI Swagger docs.

### Option B: Full Stack via Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

| Service | Host Port | Purpose |
| :--- | :---: | :--- |
| `dealscout-backend` | `8020` | FastAPI API + SSE + RTL Hebrew Web UI (`/`) |
| `postgres` (PostgreSQL 16) | `5434` | Users, profiles, price history, watchlists, approvals, audit & LLM costs |
| `redis` (Redis 7) | `6381` | Rate limiter, JTI/family revocation, crowd coupon scores, FX cache |
| `elasticsearch` (8.15.0) | `9202` | Fuzzy product catalog search |
| `kafka` (KRaft) | `9095` | `price-drop-events` & `deal-alerts` topics |
| `chromadb` | `8005` | Credit-card club policy RAG & user-scoped preferences |

---

## 📡 API Summary

| Domain | Endpoints |
| :--- | :--- |
| **Health & UI** | `GET /`, `GET /health` |
| **Auth** | `POST /api/v1/auth/register`, `verify-email`, `login`, `refresh`, `logout`, `GET /api/v1/auth/oauth/google`, `oauth/google/callback` |
| **Users & Wallet** | `GET /api/v1/users/me`, `GET/PUT /api/v1/users/me/profile`, `GET /api/v1/users/me/history`, `GET /api/v1/users/me/savings` |
| **Deals & Agents** | `POST /api/v1/deals/search` (SSE), `POST /api/v1/deals/match-from-image` (`PRO`), `GET /api/v1/deals/{product_id}/history` |
| **Cart & Coupons** | `POST /api/v1/cart/optimize-split` (`PRO`), `POST /api/v1/coupons/{code}/feedback` |
| **Watchlist & Kafka** | `GET/POST /api/v1/watchlist`, `DELETE /api/v1/watchlist/{id}`, `POST /api/v1/deals/price-drop` |
| **HITL Checkout** | `POST /api/v1/deals/checkout/initiate`, `POST /api/v1/deals/approve-checkout` |
| **Admin** | `GET /api/v1/admin/telemetry`, `PUT /api/v1/admin/users/{user_id}/tier` |

Import `postman/dealscout-multiagent.postman_collection.json` and `postman/dealscout-multiagent.postman_environment.json` into Postman for ready-to-run requests.

---

## 🧪 Running Tests & Verification Suite

```powershell
# Run Pytest unit & integration tests
.\.venv\Scripts\pytest.exe backend/tests -v

# Run full end-to-end verification suite
.\.venv\Scripts\python.exe .agents/scripts/verify_dealscout_suite.py
```

For full walkthroughs and 5 ready-to-run demo scenarios, see [`.agents/docs/STEP_BY_STEP_EXECUTION_GUIDE.md`](.agents/docs/STEP_BY_STEP_EXECUTION_GUIDE.md).
