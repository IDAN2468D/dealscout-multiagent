# 🛠️ Technical Specification (SPEC) — DealScout AI Frontend (Next.js) v2.1

## 1. מחסנית טכנולוגית (Next.js Tech Stack)
* **Framework:** Next.js 15 (App Router, Turbopack), React 19, TypeScript 5 (`strict: true`).
* **Styling & UI:** Tailwind CSS v4 (תמיכה מלאה ב-CSS Logical Properties: `ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end` עבור RTL), Framer Motion, Lucide React.
* **Typography (`next/font/google`):** `Heebo` לעברית + `Inter` למספרים, קודי קופון ונתונים טבלאיים (`tabular-nums`).
* **Server & Client State:**
  * **TanStack Query v5:** ניהול Server State, קאשינג ועדכונים אופטימיים לפרופיל, Watchlist, היסטוריית מחירים ודשבורד חיסכון.
  * **Zustand:** ניהול Client State גלובלי (`accessToken` בזיכרון בלבד, פרטי משתמש, מצב זרם SSE פעיל ומודאל HITL).
  * **React Hook Form + Zod:** ולידציית טפסים התואמת במדויק לחוזי Pydantic v2 של ה-FastAPI Backend.
* **Data Visualization:** Recharts (גרף היסטוריית מחירים 90–180 יום, פילוח חיסכון חודשי, ומעקב עלויות טוקנים של `gemini-3.5-flash-lite`).
* **Streaming Protocol:** Native `fetch` + `ReadableStream` + `TextDecoder` (מאפשר בקשות `POST` עם כותרת `Authorization: Bearer` עבור SSE, בשונה מ-`EventSource` התקני).
* **Testing & QA:** Vitest + React Testing Library (Unit/Component), Playwright (E2E).

---

## 2. ארכיטקטורת Next.js (Server vs. Client Components)

| שכבה / רכיב | סוג רכיב ב-Next.js | נימוק הנדסי |
| :--- | :--- | :--- |
| `app/layout.tsx`, דפי מעטפת וטעינת פונטים | **Server Component** | צמצום גודל ה-JS Bundle, הזרקת `lang="he" dir="rtl"` ב-SSR והגדרת Metadata |
| `middleware.ts` | **Edge Middleware** | ניתוב מהיר מנתיבים מוגנים (`/watchlist`, `/profile`, `/savings`, `/admin`) כשאין Session Cookie |
| `OmniSearchBar`, `AgentStreamLogs`, `DealResultCard` | **Client Component (`"use client"`)** | ניהול `ReadableStream` חי של SSE, גרירת תמונות, אנימציות Framer Motion ו-Optimistic UI |
| `PriceHistoryDrawer`, `TaxSplitComparison`, `GeminiCostChart` | **Client Component (Dynamic Import)** | טעינה עצלה (`next/dynamic`, `ssr: false`) של Recharts למניעת שגיאות Hydration ושיפור LCP |
| `CheckoutApprovalModal` | **Client Component** | טיימר ספירה לאחור, Focus Trap ושליחת החלטת HITL (`APPROVED` / `REJECTED`) |

---

## 3. מבנה תיקיות הפרויקט (`frontend/`)

```text
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx                       # Root Layout (lang="he" dir="rtl", Heebo/Inter, Providers)
│   │   ├── globals.css                      # Tailwind v4 + CSS variables (Light/Dark themes)
│   │   ├── error.tsx                        # Global Error Boundary
│   │   ├── loading.tsx                      # Global App Shell Skeleton
│   │   ├── page.tsx                         # Main Deal Search & Live Multi-Agent Workspace
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx               # Email/Password + Google OAuth2 Login
│   │   │   ├── register/page.tsx            # Registration + Email verification notice
│   │   │   └── auth/callback/page.tsx       # Google OAuth2 callback handler
│   │   ├── cart-optimizer/page.tsx          # PRO: Smart Cart & 75 USD VAT Split Optimizer
│   │   ├── watchlist/page.tsx               # Price Watchlist & Kafka Drop Alerts Log
│   │   ├── profile/page.tsx                 # Buyer Profile, Credit-Card Clubs & Memory Prefs
│   │   ├── savings/page.tsx                 # Personal Savings Ledger & Search History
│   │   └── admin/page.tsx                   # ADMIN: Gemini 3.5 Flash-Lite Cost & Moderation
│   ├── components/
│   │   ├── providers/
│   │   │   └── AppProviders.tsx             # QueryClientProvider + ThemeProvider + AuthBootstrap
│   │   ├── layout/
│   │   │   ├── Navbar.tsx                   # Navigation, Tier Badge, Daily Quota Meter, User Menu
│   │   │   ├── AuthGuard.tsx                # Client RBAC Gate (FREE / PRO / ADMIN)
│   │   │   └── UpgradeTierBanner.tsx        # Upgrade CTA for locked PRO features
│   │   ├── search/
│   │   │   ├── OmniSearchBar.tsx            # Text + URL + Image Dropzone (Gemini Vision)
│   │   │   ├── SearchFilters.tsx            # Max budget ILS, country, preferred stores, clubs
│   │   │   ├── AgentStreamLogs.tsx          # Live SSE timeline for all DealScout agents
│   │   │   ├── DealResultCard.tsx           # Landed cost breakdown, badges, 110V warning
│   │   │   ├── CouponPill.tsx               # One-click copy + Crowd feedback (Worked/Failed)
│   │   │   └── PriceHistoryDrawer.tsx       # 90-180d Recharts chart + Fake-Discount highlight
│   │   ├── cart/
│   │   │   ├── CartItemsEditor.tsx          # Add/Edit/Remove multi-item cart rows
│   │   │   └── TaxSplitComparison.tsx       # Single shipment (18% VAT) vs Split packs (0% VAT)
│   │   ├── hitl/
│   │   │   └── CheckoutApprovalModal.tsx    # Mandatory Human-in-the-Loop approval modal
│   │   ├── profile/
│   │   │   ├── ClubWalletSelector.tsx       # Israeli credit-card & consumer club toggles
│   │   │   └── MemoryPreferencesForm.tsx    # Warranty, max delivery days, min trust score
│   │   └── admin/
│   │       ├── GeminiCostChart.tsx          # Input/Output/Cached token & USD cost analytics
│   │       └── ModerationTables.tsx         # Broken coupons & blocked scam sellers
│   ├── hooks/
│   │   ├── useAuth.ts                       # Login, register, silent refresh, logout
│   │   ├── useDealStream.ts                 # POST SSE stream reader + AbortController + fallback
│   │   ├── useWatchlist.ts                  # Watchlist queries & optimistic mutations
│   │   └── useCartOptimizer.ts              # Tax split API mutation hook
│   ├── lib/
│   │   ├── apiClient.ts                     # Fetch wrapper with 401 Mutex Auto-Refresh Queue
│   │   ├── sseParser.ts                     # Chunk-safe SSE frame parser (event: / data:)
│   │   ├── formatters.ts                    # ILS/USD currency, RTL-safe numbers, dates
│   │   ├── mockStream.ts                    # Offline demo SSE generator for UI development
│   │   └── schemas.ts                       # Zod schemas mirroring FastAPI Pydantic models
│   ├── store/
│   │   ├── authStore.ts                     # In-memory accessToken + currentUser
│   │   └── searchStore.ts                   # Live SSE events, ranked deals, pending HITL
│   └── types/
│       └── api.ts                           # Strict TypeScript contracts
├── middleware.ts                            # Next.js Edge Route Guard
├── next.config.ts                           # Image domains, API rewrites, standalone output
├── tailwind.config.ts
├── tsconfig.json
├── Dockerfile                               # Multi-stage Next.js standalone production build
└── package.json
```

---

## 4. קונפיגורציית `next.config.ts` ומשתני סביבה

### 4.1 משתני סביבה (`.env.local`)
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_ENABLE_MOCK_FALLBACK=false
NEXT_PUBLIC_APP_ENV=development
```

### 4.2 קונפיגורציית Next.js (`next.config.ts`)
* `output: "standalone"` — לבניית Docker Image רזה ומהירה לפרודקשן.
* הגדרת `images.remotePatterns` מאובטחים עבור תמונות מוצרים מחנויות מאושרות (Amazon, AliExpress, ASOS, eBay, KSP).
* אופציית `rewrites` להעברת `/api/v1/:path*` לשרת ה-FastAPI למניעת בעיות CORS ו-SameSite Cookies בסביבת פיתוח.

---

## 5. ארכיטקטורת אבטחה, אימות (JWT + OAuth2) ו-RBAC

* **אחסון טוקנים מאובטח:**
  * `access_token` מוחזק **בזיכרון בלבד** (`authStore.ts` של Zustand) ואינו נכתב לעולם ל-`localStorage` או `sessionStorage` (הגנה מפני XSS).
  * `refresh_token` נשמר כ-`HttpOnly; Secure; SameSite=Lax` Cookie ומצורף אוטומטית באמצעות `credentials: "include"`.
* **מנגנון 401 Auto-Refresh Mutex (`src/lib/apiClient.ts`):**
  * בעת קבלת `401 Unauthorized`, הקליינט עוצר בקשות מקבילות בתור (Promise Queue), שולח בקשת רענון אחת בלבד אל `POST /api/v1/auth/refresh`, מעדכן את ה-`access_token` בזיכרון ומריץ מחדש את כל הבקשות שהמתינו.
  * אם הרענון נכשל, מתבצע איפוס של `authStore` והפניה ל-`/login`.
* **שכבת RBAC כפולה:**
  1. `middleware.ts` בודק קיום Session Cookie לפני כניסה לנתיבים מוגנים.
  2. `AuthGuard.tsx` מוודא התאמת `role` (`PRO` עבור `/cart-optimizer`, `ADMIN` עבור `/admin`) ומציג מסך שדרוג או חסימת הרשאה בהתאם.

---

## 6. חוזי TypeScript מול ה-Backend (`src/types/api.ts`)

```ts
export type UserRole = "FREE" | "PRO" | "ADMIN";
export type DiscountVerdict =
  | "GREAT_DEAL"
  | "FAIR_PRICE"
  | "FAKE_DISCOUNT"
  | "INCOMPATIBLE_SPEC"
  | "BLOCKED_SCAM";

export interface UserProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  daily_searches_used: number;
  daily_searches_limit: number;
  preferred_currency: "ILS" | "USD" | "EUR";
  ship_to_country: string;
  credit_card_clubs: string[];
  preferred_stores: string[];
  min_seller_trust: number;
  telegram_chat_id?: string | null;
}

export interface DealSearchRequest {
  query: string;
  max_budget_ils?: number;
  override_ship_to?: string;
  use_saved_profile: boolean;
}

export interface CouponInfo {
  code: string;
  discount_description: string;
  verified: boolean;
  success_rate: number; // 0..100 from Redis crowd feedback
  club_required?: string;
}

export interface LandedCostBreakdown {
  base_price_usd: number;
  coupon_discount_usd: number;
  applied_coupons: CouponInfo[];
  shipping_usd: number;
  vat_applied: boolean;
  vat_amount_usd: number;
  total_landed_usd: number;
  total_landed_ils: number;
  fx_rate_ils: number;
}

export interface DealCandidate {
  deal_id: string;
  store_name: string;
  product_title: string;
  product_url: string;
  affiliate_url: string;
  image_url?: string;
  seller_trust_score: number;
  in_stock: boolean;
  fake_discount_flag: boolean;
  compatibility_warnings: string[];
  discount_verdict: DiscountVerdict;
  historical_low_usd: number;
  avg_90d_usd: number;
  cost_breakdown: LandedCostBreakdown;
}

export type SSEEventType =
  | "agent_step"
  | "tool_call"
  | "warning_flag"
  | "deal_ranked"
  | "approval_required"
  | "final_report"
  | "error";

export interface AgentStreamEvent {
  id: string;
  type: SSEEventType;
  timestamp: string;
  agent_id:
    | "deal-orchestrator-agent"
    | "multimodal-product-matcher"
    | "store-search-mcp-agent"
    | "coupon-hunter-rag-agent"
    | "price-history-auditor"
    | "review-compatibility-auditor"
    | "landed-cost-calculator"
    | "smart-cart-tax-optimizer"
    | "trust-guardrails-hitl-agent";
  message: string;
  tool_name?: string;
  latency_ms?: number;
  payload?: Record<string, unknown>;
}

export interface CartItemInput {
  sku: string;
  title: string;
  store_name: string;
  unit_price_usd: number;
  quantity: number;
}

export interface CartSplitRequest {
  store_name: string;
  items: CartItemInput[];
  shipping_per_package_usd: number;
  free_shipping_threshold_usd?: number | null;
  ship_to_country: string;
}

export interface PendingCheckoutApproval {
  approval_id: string;
  deal: DealCandidate;
  expires_at: string;
  reason: string;
}
```

---

## 7. מיפוי Endpoints צד-שרת לפעולות Next.js

| פעולה בממשק | Method & Endpoint | מימוש ב-Frontend |
| :--- | :--- | :--- |
| הרשמה / התחברות / רענון / התנתקות | `POST /api/v1/auth/{register,login,refresh,logout}` | `apiClient` עם `credentials: "include"` |
| התחברות Google OAuth2 | `GET /api/v1/auth/oauth/google` | Redirect מלא + סיום ב-`/auth/callback` |
| חיפוש טקסט (SSE) | `POST /api/v1/deals/search` | `useDealStream` (`fetch` + `ReadableStream` + `AbortController`) |
| חיפוש מתמונה / URL (Vision SSE) | `POST /api/v1/deals/match-from-image` | `FormData` (JPG/PNG/WebP עד 5MB) אל `gemini-3.5-flash-lite` |
| היסטוריית מחירים לגרף | `GET /api/v1/deals/{product_id}/history` | TanStack Query (`staleTime: 5m`) + Recharts |
| אימות קופון קהילתי | `POST /api/v1/coupons/{code}/feedback` | Optimistic UI update ל-`success_rate` |
| אופטימיזציית פיצול סל (רף 75 דולר) | `POST /api/v1/cart/optimize-split` | מוגן ל-`PRO`, השוואה ויזואלית לפני/אחרי |
| אישור/דחיית Checkout (HITL) | `POST /api/v1/deals/approve-checkout` | `CheckoutApprovalModal` (`APPROVED` / `REJECTED`) |
| ניהול Watchlist | `GET / POST / DELETE /api/v1/watchlist` | TanStack Query + עדכון אופטימי |
| פרופיל, היסטוריה וחיסכון | `GET/PUT /api/v1/users/me/{profile,history,savings}` | מסונכרן למועדוני האשראי וזיכרון הסוכן |

---

## 8. ניהול זרם SSE (`src/hooks/useDealStream.ts` & `sseParser.ts`)
* שימוש ב-`AbortController` לביטול מיידי של חיפוש קודם בעת הזנת שאילתה חדשה או ניווט לדף אחר.
* חוצץ טקסט מצטבר (`Chunk Boundary Buffering`) לפיענוח מדויק של בלוקי `event:` ו-`data:` גם כשחבילות TCP חותכות אובייקט JSON באמצע.
* תמיכה מובנית ב-`NEXT_PUBLIC_ENABLE_MOCK_FALLBACK=true` כדי לאפשר פיתוח והדגמת UI גם כשה-Backend כבוי.

---

## 9. הנחיות עיצוב ומערכת עיצוב (Design System)
* **שפה חזותית:** Modern SaaS / FinTech-Commerce נקי עם Dark & Light Mode, כרטיסים חדים והדגשה ברורה של `total_landed_ils` בטיפוגרפיה `tabular-nums`.
* **קידוד צבע סמנטי:**
  * `Emerald` — `GREAT_DEAL`, קופון מאומת, פטור ממע"מ (עד 75 דולר).
  * `Amber` — אזהרת מתח `110V`, מלאי נמוך, התקרבות למכסת החיפוש היומית.
  * `Rose` — `FAKE_DISCOUNT`, מוכר חסום (`BLOCKED_SCAM`), שגיאת תקשורת.
  * `Indigo` — חיווי סוכן פעיל (`gemini-3.5-flash-lite`) וכפתורי פעולה ראשיים.
* **בידוד כיווניות (BiDi / RTL Safety):** כל קודי הקופונים, המחירים, המטבעות והמק"טים עטופים בתגית `<span dir="ltr">` למניעת היפוך סימנים בתוך טקסט עברי.