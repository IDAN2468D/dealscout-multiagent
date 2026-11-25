# 📅 Implementation Plan & Milestones (PLAN) — DealScout AI Frontend (Next.js) v2.1

תוכנית הפיתוח של צד ה-Frontend פרוסה על פני 4 ספרינטים דו-שבועיים (8 שבועות סה"כ), בתיאום מלא עם חוזי ה-API וה-SSE של ה-Backend.

---

## Sprint 1: תשתיות Next.js 15, מערכת עיצוב RTL, אימות ו-RBAC (שבועות 1–2)
**מטרה:** הקמת שלד האפליקציה ב-Next.js App Router, תמיכת RTL מלאה, מנגנון JWT מאובטח ללא `localStorage` והגנת מסלולים.

* [ ] אתחול פרויקט `frontend/` עם Next.js 15 (App Router), React 19, TypeScript Strict, Tailwind CSS v4, Framer Motion ו-Lucide React.
* [ ] הגדרת `src/app/layout.tsx` עם `lang="he" dir="rtl"`, פונטי `Heebo` + `Inter` דרך `next/font/google`, ו-`AppProviders.tsx` (`QueryClientProvider`, Theme).
* [ ] כתיבת `src/types/api.ts` ו-`src/lib/schemas.ts` (Zod) התואמים במלואם לסכמות ה-Pydantic v2 של ה-Backend.
* [ ] מימוש `src/store/authStore.ts` (שמירת `accessToken` בזיכרון בלבד) ו-`src/lib/apiClient.ts` כולל תור רענון אוטומטי (401 Mutex Queue) מול `POST /api/v1/auth/refresh`.
* [ ] בניית `middleware.ts` ו-`AuthGuard.tsx` לאכיפת RBAC (`FREE` / `PRO` / `ADMIN`).
* [ ] בניית מסכי `/login`, `/register`, `/auth/callback` (Google OAuth2) ורכיב `Navbar.tsx` (מד מכסה יומית ותגית מסלול).

**Definition of Done (Sprint 1):**
* משתמש יכול להירשם, להתחבר (כולל Google OAuth2), לרענן סשן אוטומטית ולהתנתק.
* גישה ל-`/admin` או `/cart-optimizer` ללא הרשאה מתאימה נחסמת או מציגה מסך שדרוג ברור.

---

## Sprint 2: חיפוש מולטי-מודאלי, זרם SSE חי וכרטיסי עסקאות (שבועות 3–4)
**מטרה:** בניית סביבת החיפוש המרכזית עם שידור חי של צוות הסוכנים (`gemini-3.5-flash-lite`) וכרטיסי תוצאות מלאים.

* [ ] מימוש `src/lib/sseParser.ts`, `src/lib/mockStream.ts` ו-`src/hooks/useDealStream.ts` (תמיכה ב-`POST` SSE עם Bearer Token, ביטול דרך `AbortController` ו-Chunk Buffering).
* [ ] בניית `OmniSearchBar.tsx` עם 3 מצבי קלט: טקסט חופשי, הדבקת URL והעלאת/גרירת תמונה (וולידציית גודל וסוג קובץ לפני שליחה ל-`gemini-3.5-flash-lite` Vision).
* [ ] בניית `SearchFilters.tsx` (תקציב בש"ח, ארץ יעד, חנויות מועדפות והפעלת פרופיל מועדונים).
* [ ] בניית `AgentStreamLogs.tsx` — פיד חי המציג את 9 הסוכנים, קריאות כלי ה-MCP, זמני ריצה והתרעות Guardrails בזמן אמת.
* [ ] בניית `DealResultCard.tsx` (פירוט עלות סופית עד הבית כולל שורת מע"מ 18% או פטור עד 75 דולר, תגיות `GREAT_DEAL` / `FAKE_DISCOUNT` ואזהרת `110V`) ו-`CouponPill.tsx` (העתקה בלחיצה + הצבעת קהילה "עבד / לא עבד" עם Optimistic UI).

**Definition of Done (Sprint 2):**
* שאילתת טקסט או תמונה מתחילה להזרים אירועי SSE לממשק תוך פחות מ-1.2 שניות.
* כרטיסי התוצאות מדורגים לפי `total_landed_ils` ומציגים פירוט מס, קופונים מאומתים ואזהרות ללא שיבוש RTL.

---

## Sprint 3: גרף היסטוריית מחירים, פיצול סל (75 דולר), Watchlist ושער HITL (שבועות 5–6)
**מטרה:** השלמת הכלים האנליטיים והאינטראקטיביים — גרף מחירים, אופטימיזציית פיצול מע"מ, מעקב מחירים ושער אישור אנושי.

* [ ] בניית `PriceHistoryDrawer.tsx` עם Recharts (טעינה עצלה דרך `next/dynamic`) להצגת גרף 90–180 יום, קו All-Time Low, ממוצע 90 יום והדגשת קפיצות `FAKE_DISCOUNT`.
* [ ] בניית עמוד `/cart-optimizer` (`CartItemsEditor.tsx` + `TaxSplitComparison.tsx`) להשוואה ויזואלית בין משלוח מאוחד לפיצול חבילות מתחת לרף 75 דולר כולל תצוגת החיסכון בש"ח.
* [ ] בניית עמוד `/watchlist` ו-`useWatchlist.ts`: הוספה ומחיקה אופטימית, מחיר יעד בש"ח, בחירת ערוצי התראה ויומן אירועי ירידת מחיר מ-Kafka.
* [ ] בניית `CheckoutApprovalModal.tsx` — שער אישור אנושי (HITL) מלא המחובר ל-`POST /api/v1/deals/approve-checkout` כולל ספירה לאחור לפקיעת האישור.

**Definition of Done (Sprint 3):**
* ניתן לפתוח גרף היסטוריה מכל כרטיס עסקה, להריץ אופטימיזציית פיצול סל, לנהל Watchlist, ולאשר או לדחות Checkout במודאל ה-HITL.

---

## Sprint 4: ארנק מועדונים, דשבורד חיסכון, פאנל Admin, בדיקות ו-Docker (שבועות 7–8)
**מטרה:** השלמת אזור המשתמש ופאנל המנהל, כיסוי בדיקות אוטומטיות ואריזת קונטיינר לייצור.

* [ ] בניית `/profile` (`ClubWalletSelector.tsx` + `MemoryPreferencesForm.tsx`) לבחירת מועדוני צרכנות/אשראי והעדפות קונה ארוכות-טווח.
* [ ] בניית `/savings` — דשבורד חיסכון אישי עם פילוח לפי מקור חיסכון (קופונים, פיצול מע"מ, הימנעות מ-Fake Discounts) והיסטוריית חיפושים.
* [ ] בניית `/admin` (מוגן ל-`ADMIN`): `GeminiCostChart.tsx` למעקב טוקנים ועלויות `gemini-3.5-flash-lite` + `ModerationTables.tsx` לניהול קופונים ומוכרים חשודים.
* [ ] כתיבת בדיקות Unit/Component ב-Vitest (`sseParser`, `DealResultCard`, `CheckoutApprovalModal`) ובדיקות E2E ב-Playwright לתרחישי Auth, חיפוש SSE ואישור Checkout.
* [ ] כתיבת `frontend/Dockerfile` (Next.js `standalone`) ושילוב שירות ה-Frontend בתוך `docker-compose.yml` המרכזי לצד ה-Backend.

**Definition of Done (Sprint 4):**
* כל בדיקות Vitest ו-Playwright עוברות ללא שגיאות TypeScript או Hydration.
* האפליקציה עולה בפקודה אחת בתוך `docker-compose up --build` ועובדת באופן מלא במובייל ובדסקטופ.