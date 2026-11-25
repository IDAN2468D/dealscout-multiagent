# 🛠️ Technical Specification (SPEC) — DealScout AI (`dealscout-multiagent`) v2.1

## 1. מחסנית טכנולוגית (Tech Stack)
* **Backend & API:** Python 3.11+, FastAPI, Uvicorn, Pydantic v2, SSE (`StreamingResponse`).
* **AI Engine & Multi-Agent Framework:**
  * **Primary Model:** Google **`gemini-3.5-flash-lite`** via `google-genai>=1.15.0` & Agno (`agno.models.google.Gemini`).
  * **Optional Escalation Routing:** אפשרות תצורה ב-`.env` להעלאת סוכן ה-Orchestrator למודל חזק יותר (`GEMINI_ORCHESTRATOR_MODEL`) מבלי לשנות קוד.
  * **Gemini Native Capabilities:** Multimodal Vision (תמונות מוצר), Google Search Grounding (`search=True`), URL Context (`url_context=True`), Structured Outputs (`output_schema`) ו-Context Caching.
* **Auth & Security:** `PyJWT` (Access & Refresh Tokens), `argon2-cffi` (Password Hashing), `Authlib` (Google OAuth2), RBAC & Redis Sliding-Window Rate Limiter.
* **Search, DB & Cache:**
  * **Elasticsearch 8.x:** קטלוג מוצרים, נרמול דגמים וחיפוש Fuzzy.
  * **PostgreSQL 16:** משתמשים, פרופילים, היסטוריית מחירים, Watchlists, ארנק חיסכון, פידבק קופונים, אישורי HITL ו-Audit Logs (כולל `input_tokens`, `output_tokens`, `llm_cost_usd`).
  * **Redis 7:** קאש קופונים, `success_rate` קהילתי, שערי מט"ח, Rate Limiting ו-JWT Refresh Revocation List.
* **RAG & Vector Store:** ChromaDB (מדיניות קופונים, הטבות מועדוני אשראי, קאשבק וזיכרון העדפות ארוך-טווח).
* **MCP Layer:** Official Python `mcp` SDK (`FastMCP`) לשלושה שרתי MCP מבודדים ומודעי-`user_id`.
* **Event Streaming & Observability:** Apache Kafka (`price-drop-events`, `deal-alerts`), OpenTelemetry + Langfuse לניטור טוקנים, עלויות וזמני תגובה.
* **Infrastructure & QA:** Docker, Docker Compose, Pytest.

---

## 2. דיאגרמת ארכיטקטורה וזרימת נתונים

```text
[ Web UI / Chrome Extension / Telegram Bot ]
        │ (Authorization: Bearer JWT + SSE Stream)
        ▼
[ FastAPI Gateway: JWT Auth + RBAC + Redis Rate Limiter ]
        │ (Injects Verified `UserContext`: user_id, tier, buyer_profile)
        ├──────────────────────────────────────────────────────────┐
        ▼                                                          ▼
[ DealOrchestratorAgent (Agno + Gemini 3.5 Flash-Lite) ]   [ Telemetry & Cost Ledger ]
        │ (Concurrent User-Scoped Delegation)              (OpenTelemetry / Langfuse)
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
               │                                    (Checkout -> User Sign-Off)
               ▼
   [ Kafka `deal-alerts` ] ──► [ Notify MCP (Telegram / Slack / Email) ]
```

---

## 3. תצורת `gemini-3.5-flash-lite` וניתוב מודלים (Model Routing)

### 3.1 משתני סביבה (`backend/app/core/config.py`)
```env
GOOGLE_API_KEY=AIzaSy...
GEMINI_ORCHESTRATOR_MODEL=gemini-3.5-flash-lite
GEMINI_SUBAGENT_MODEL=gemini-3.5-flash-lite
GEMINI_TEMPERATURE=0.2
GEMINI_CONTEXT_CACHE_TTL_SECONDS=3600
```

### 3.2 שיבוץ יכולות Gemini לפי סוכן (9 סוכנים)
| # | מזהה סוכן | מודל / מנוע | יכולות מיוחדות וכלים |
| :--- | :--- | :--- | :--- |
| 1 | `deal-orchestrator-agent` | `gemini-3.5-flash-lite` | תזמור מקבילי, `UserBuyerProfile`, Long-Term Memory, SSE Streaming |
| 2 | `multimodal-product-matcher` | `gemini-3.5-flash-lite` | **Vision** (צילומי מסך/תמונות) + **`url_context=True`** לחילוץ SKU/ASIN ומפרט |
| 3 | `store-search-mcp-agent` | `gemini-3.5-flash-lite` | Elasticsearch + `ecommerce_mcp` + **`search=True`** (Google Search Grounding) |
| 4 | `coupon-hunter-rag-agent` | `gemini-3.5-flash-lite` | ChromaDB + **`Context Caching`** למדיניות מועדוני אשראי + `coupons_mcp` + Redis Crowd Score |
| 5 | `price-history-auditor` | `gemini-3.5-flash-lite` + SQL Tools | הצלבת 90–180 יום ב-PostgreSQL וזיהוי Fake Discount (>15%) |
| 6 | `review-compatibility-auditor` | `gemini-3.5-flash-lite` | סינון ביקורות בוטים, זיופים והתראות מתח `110V/220V` ותקע ישראלי |
| 7 | `landed-cost-calculator` | **Python דטרמיניסטי** | אפס חישובי LLM — המרת מט"ח, קופונים, משלוח ומע"מ 18% מעל $75 |
| 8 | `smart-cart-tax-optimizer` | **Python דטרמיניסטי** | Bin-Packing לפיצול חבילות מתחת ל-$75 או איחוד למשלוח חינם |
| 9 | `trust-guardrails-hitl-agent` | Python Sanitizer + `gemini-3.5-flash-lite` | חסימת Prompt Injection, ציון אמינות מוכר ושער אישור Checkout (`notify_mcp`) |

---

## 4. אבטחה, אימות (Auth), RBAC ובידוד משתמשים

### 4.1 תצורת אימות (`backend/app/core/security.py`)
* **הצפנת סיסמאות:** `Argon2id` עם Salt אקראי לכל משתמש.
* **JWT Access Token:** תוקף `15 דקות`, מכיל `sub` (`user_id`), `role` (`FREE` / `PRO` / `ADMIN`), `jti` ו-`exp`.
* **Refresh Token:** תוקף `7 ימים`, נשמר ב-`HttpOnly`, `Secure`, `SameSite=Lax` Cookie ונרשם כ-Hash בטבלת `refresh_tokens`. בכל רענון מתבצע **Token Rotation**; זיהוי שימוש חוזר בטוקן ישן מבטל את כלל משפחת הטוקנים ב-Redis.
* **OAuth2:** תמיכה בכניסה עם Google (`GET /api/v1/auth/oauth/google` ו-callback).

### 4.2 מדיניות מכסות ו-Rate Limiting (Redis)
| Tier | חיפושי סוכנים / יום | מגבלת Watchlist | פיצול סל + תמונה/URL | ערוצי התראה |
| :--- | :--- | :--- | :--- | :--- |
| **`FREE`** | 10 | 3 מוצרים | חסום (`403 Upgrade Required`) | Email |
| **`PRO`** | ללא הגבלה (עד 60/שעה) | 50 מוצרים | פתוח | Email, Telegram, Slack |
| **`ADMIN`** | ללא הגבלה | ללא הגבלה | פתוח + ניהול מערכת | הכל + התראות מערכת |

### 4.3 חוזי שרתי ה-MCP ומניעת IDOR
| שרת MCP | כלים (Tools) | רמת גישה | הגנה ובידוד (`UserContext`) |
| :--- | :--- | :--- | :--- |
| `ecommerce_mcp.py` | `search_store_offers`, `get_product_details`, `check_stock_shipping`, `fetch_product_reviews` | `READ` | סניטציית Python נגד Prompt Injection לפני העברה ל-Gemini + Rate Limit + Timeout (`3s`) |
| `coupons_mcp.py` | `find_store_coupons`, `validate_coupon_dry_run`, `check_stacking_rules`, `get_crowd_score` | `READ` | התאמה למועדוני המשתמש + פסילת קופונים עם `success_rate < 0.35` |
| `notify_mcp.py` | `send_price_alert`, `dispatch_checkout_approval_card` | `WRITE` | אימות בעלות `watchlist.user_id == ctx.user_id`; Checkout מחייב אישור `APPROVED` מהמשתמש המחובר בלבד |

---

## 5. לוגיקה דטרמיניסטית ומטריצת החלטות

### 5.1 מחשבון עלות סופית (`backend/app/tools/landed_cost_tools.py`)
* שליפת שער מט"ח מ-Redis (עם Fallback קבוע להרצה אופליין).
* החלת קופונים מאומתים והטבות מועדון לפי סדר חוקיות Stacking מה-RAG.
* **לוגיקת מע"מ יבוא אישי לישראל (`ship_to_country == "IL"`):**
  * ערך מוצר נטו (לאחר קופון, לפני משלוח) $\le \$75.00$ — פטור ממע"מ (`vat_applied = False`).
  * ערך מוצר נטו $> \$75.00$ — מוסף מע"מ בשיעור `18%` על סכום המוצר נטו + המשלוח.

### 5.2 אלגוריתם פיצול סל חכם (`backend/app/tools/cart_split_optimizer_tools.py`)
* משווה דטרמיניסטית בין הזמנה מאוחדת אחת לבין פיצול לחבילות משנה שכל אחת נשארת $\le \$75.00$, תוך שקלול דמי משלוח לחבילה ורף משלוח חינם, ומחזיר את החלוקה הזולה ביותר והחיסכון בש"ח ובדולר.

### 5.3 מטריצת סיווג עסקאות
| תנאי | סיווג עסקה | פעולת מערכת |
| :--- | :--- | :--- |
| מחיר נמוך ב-10%+ מממוצע 90 יום והנחה אמיתית | `GREAT_DEAL` | הצגה בראש הדירוג + התראת Watchlist |
| מחיר תואם ממוצע ללא חריגות | `FAIR_PRICE` | הצגה בדירוג רגיל |
| עליית מחיר של 15%+ ב-30 הימים לפני המבצע | `FAKE_DISCOUNT` | תגית אזהרה אדומה + הורדת ציון דירוג |
| זיהוי מתח 110V (לישראל) או ביקורות בוטים חריגות | `INCOMPATIBLE_SPEC` | הצמדת אזהרת תאימות מפורשת בכרטיס המוצר |
| ציון אמינות מוכר מתחת ל-70 או זיהוי הונאה/הזרקה | `BLOCKED_SCAM` | פסילה מהדירוג ורישום ב-`audit_logs` |
| בקשת הוספה לעגלה / הזמנה | `PENDING_APPROVAL` | עצירה והמתנה לאישור המשתמש המחובר (HITL) |

---

## 6. מודל נתונים (PostgreSQL Tables)
* `users` (`id`, `email`, `password_hash`, `oauth_provider`, `role`, `tier`, `is_verified`, `created_at`)
* `refresh_tokens` (`id`, `user_id`, `token_hash`, `family_id`, `expires_at`, `revoked_at`)
* `user_buyer_profiles` (`user_id`, `preferred_currency`, `ship_to_country`, `credit_card_clubs_json`, `min_seller_trust`, `preferred_stores_json`, `notification_channels_json`)
* `user_search_history` (`id`, `user_id`, `query`, `model_id`, `best_landed_ils`, `input_tokens`, `output_tokens`, `cached_tokens`, `llm_cost_usd`, `created_at`)
* `user_savings_ledger` (`id`, `user_id`, `source_type` [`COUPON` | `TAX_SPLIT` | `FAKE_SALE_AVOIDED`], `saved_ils`, `created_at`)
* `coupon_feedback` (`id`, `coupon_code`, `store_name`, `user_id`, `worked`, `created_at`)
* `price_history`, `watchlists` (`user_id`), `pending_approvals` (`user_id`), `audit_logs` (`user_id`).

---

## 7. חוזי API וסכמות Pydantic v2

### 7.1 Endpoints עיקריים (`backend/app/api/`)
* **Auth (`auth_routes.py`):** `POST /api/v1/auth/register`, `verify-email`, `login`, `refresh`, `logout`, `GET /api/v1/auth/oauth/google`, `oauth/google/callback`.
* **Users (`user_routes.py`):** `GET/PUT /api/v1/users/me/profile`, `GET /api/v1/users/me/history`, `GET /api/v1/users/me/savings`.
* **Deals, Agents & Feedback (`deal_routes.py`):**
  * `POST /api/v1/deals/search` — מזרים אירועי SSE (`agent_step`, `tool_call`, `warning_flag`, `deal_ranked`, `final_report`).
  * `POST /api/v1/deals/match-from-image` — קולט URL או תמונה (`PRO`) ומעביר ל-`gemini-3.5-flash-lite` (Vision / `url_context`).
  * `POST /api/v1/cart/optimize-split` — אופטימיזציית פיצול סל לחיסכון במע"מ (`PRO`).
  * `POST /api/v1/coupons/{code}/feedback` — דיווח הצלחה/כישלון קופון ועדכון `success_rate` ב-Redis.
  * `POST /api/v1/watchlist` | `GET /api/v1/deals/{product_id}/history` | `POST /api/v1/deals/approve-checkout` | `GET /health`.

### 7.2 סכמות ליבה (`backend/app/api/schemas.py`)

```python
from pydantic import BaseModel, EmailStr, Field
from typing import Literal, Optional

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=10, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=80)

class UserBuyerProfileUpdate(BaseModel):
    preferred_currency: Literal["ILS", "USD", "EUR"] = "ILS"
    ship_to_country: str = Field(default="IL", min_length=2, max_length=2)
    credit_card_clubs: list[str] = Field(default_factory=list)
    preferred_stores: list[str] = Field(default_factory=list)
    min_seller_trust: int = Field(default=75, ge=50, le=100)
    telegram_chat_id: Optional[str] = None

class DealSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    max_budget_ils: Optional[float] = Field(default=None, gt=0)
    override_ship_to: Optional[str] = Field(default=None, min_length=2, max_length=2)
    use_saved_profile: bool = True

class CartItemInput(BaseModel):
    sku: str
    title: str
    store_name: str
    unit_price_usd: float = Field(..., gt=0)
    quantity: int = Field(default=1, ge=1)

class CartSplitRequest(BaseModel):
    store_name: str
    items: list[CartItemInput] = Field(..., min_length=2)
    shipping_per_package_usd: float = Field(default=12.0, ge=0)
    free_shipping_threshold_usd: Optional[float] = Field(default=49.0, ge=0)
    ship_to_country: str = Field(default="IL", min_length=2, max_length=2)

class CouponFeedbackRequest(BaseModel):
    store_name: str
    worked: bool
    cart_total_usd: Optional[float] = None

class LandedCostBreakdown(BaseModel):
    base_price_usd: float
    coupon_discount_usd: float
    applied_coupons: list[str]
    shipping_usd: float
    vat_applied: bool
    vat_amount_usd: float
    total_landed_usd: float
    total_landed_ils: float

class DealCandidate(BaseModel):
    store_name: str
    product_title: str
    product_url: str
    affiliate_url: str
    seller_trust_score: int = Field(ge=0, le=100)
    in_stock: bool
    fake_discount_flag: bool
    compatibility_warnings: list[str] = Field(default_factory=list)
    discount_verdict: Literal[
        "GREAT_DEAL", "FAIR_PRICE", "FAKE_DISCOUNT", "INCOMPATIBLE_SPEC", "BLOCKED_SCAM"
    ]
    historical_low_usd: float
    cost_breakdown: LandedCostBreakdown

class CheckoutApprovalRequest(BaseModel):
    approval_id: str
    decision: Literal["APPROVED", "REJECTED"]
    user_note: Optional[str] = None
```