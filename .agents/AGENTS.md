# 🤖 DealScout AI — Multi-Agent Topology & Directory (`dealscout-multiagent`)

## 1. סקירה כללית
**DealScout AI** היא מערכת Multi-Agent צד-שרת לאיתור מבצעים, אימות קופונים והטבות מועדונים, זיהוי הנחות פיקטיביות ואופטימיזציית מס ביבוא אישי.
המערכת מיושמת בתבנית **Orchestrator-Worker** על גבי **Agno** ומנוע ה-AI **`gemini-3.5-flash-lite`** של Google (`google-genai`), תוך בידוד הרשאות מלא לפי משתמש מחובר (`UserContext`), חיבורי **MCP**, ושמירת כל החישובים הכספיים בידי כלי Python דטרמיניסטיים בלבד.

---

## 2. מדריך צוות הסוכנים (9 סוכנים)

### 1. Deal Orchestrator Agent (`deal-orchestrator-agent`)
* **תפקיד:** ארכיטקט התזמור הראשי ומנהל הזרימה.
* **מודל:** `gemini-3.5-flash-lite` *(ניתן לניתוב דינמי דרך `GEMINI_ORCHESTRATOR_MODEL`)*.
* **אחריות:**
  - קולט שאילתה חופשית וממזג אותה עם `UserBuyerProfile` (מועדוני אשראי, ארץ משלוח, תקציב) וזיכרון ארוך-טווח.
  - מאציל במקביל משימות לסוכני החיפוש, הקופונים, היסטוריית המחירים והתאימות.
  - מדרג את התוצאות לפי `total_landed_ils` בסדר עולה ומזרים צעדים חיים ב-SSE.
* **קוד מקור:** `backend/app/agents/deal_orchestrator.py`

### 2. Multimodal Product Matcher Agent (`multimodal-product-matcher`)
* **תפקיד:** זיהוי מוצר ודגם מתמונה, צילום מסך או קישור.
* **מודל:** `gemini-3.5-flash-lite` (Vision מובנה + `url_context=True`).
* **אחריות:**
  - מחלץ מותג, מספר דגם מדויק, `SKU` / `UPC` / `ASIN` ומפרט טכני מתמונות או מ-URL של חנות יקרה.
  - מעביר מזהים מנורמלים ל-Orchestrator למציאת הצעות זולות יותר בחנויות מתחרות.

### 3. Store Search MCP Agent (`store-search-mcp-agent`)
* **תפקיד:** איתור הצעות, מלאי ועלויות משלוח בין חנויות.
* **מודל:** `gemini-3.5-flash-lite` (`search=True` — Google Search Grounding).
* **כלים:** `elasticsearch_catalog.py`, `ecommerce_mcp.py` (`search_store_offers`, `check_stock_shipping`).
* **אחריות:**
  - מבצע חיפוש Fuzzy ב-Elasticsearch ומאחד שמות דגמים ווריאציות.
  - משלים מחירים עדכניים דרך `ecommerce_mcp` וחיפוש חי ברשת.

### 4. Coupon Hunter & Clubs RAG Agent (`coupon-hunter-rag-agent`)
* **תפקיד:** ציד קופונים עובדים, קאשבק והטבות מועדוני אשראי.
* **מודל:** `gemini-3.5-flash-lite` + **Gemini Context Caching**.
* **כלים:** `promo_policy_store.py` (ChromaDB), `coupons_mcp.py` (`find_store_coupons`, `validate_coupon_dry_run`, `get_crowd_score`).
* **אחריות:**
  - מתעדף הנחות למועדוני האשראי והצרכנות שבפרופיל המשתמש.
  - בודק Coupon Stacking ופוסל קופונים פגי תוקף או בעלי ציון קהילה (`success_rate`) מתחת ל-0.35.

### 5. Price History Auditor Agent (`price-history-auditor`)
* **תפקיד:** מבקר היסטוריית מחירים וזיהוי "מבצע פיקטיבי".
* **מודל:** `gemini-3.5-flash-lite` + שאילתות SQL דטרמיניסטיות.
* **כלים:** `price_history_tools.py` (PostgreSQL).
* **אחריות:**
  - משווה את המחיר הנוכחי לממוצע 90 יום ולשפל ההיסטורי (`historical_low_usd`).
  - מסמן `FAKE_DISCOUNT` בכל מקרה של עליית מחיר מלאכותית מעל 15% ב-30 הימים שלפני המבצע.

### 6. Review & Compatibility Auditor Agent (`review-compatibility-auditor`)
* **תפקיד:** ניתוח אמינות ביקורות ותאימות טכנית לישראל.
* **מודל:** `gemini-3.5-flash-lite`.
* **כלים:** `review_compatibility_tools.py`, `ecommerce_mcp.py` (`fetch_product_reviews`).
* **אחריות:**
  - מאתר ביקורות בוטים חוזרות או תלונות על מוצרים מזויפים.
  - מתריע על אי-תאימות חשמלית (מוצר `110V` / תקע US עבור משלוח לישראל) או מידות חריגות (`INCOMPATIBLE_SPEC`).

### 7. Landed Cost Calculator (`landed-cost-calculator`)
* **תפקיד:** מחשבון עלות סופית עד הבית (דטרמיניסטי — אפס חישובי LLM).
* **מנוע:** Python טהור (`backend/app/tools/landed_cost_tools.py`).
* **אחריות:**
  - ממיר מט"ח לפי שער מעודכן ב-Redis, מקזז קופונים מאומתים ומוסיף משלוח.
  - מחשב מע"מ 18% ליבוא אישי לישראל כאשר מחיר המוצר נטו עולה על `$75.00`.

### 8. Smart Cart Tax-Split Optimizer (`smart-cart-tax-optimizer`)
* **תפקיד:** אופטימיזציית פיצול או איחוד סל רב-פריטים (דטרמיניסטי).
* **מנוע:** Python טהור (`backend/app/tools/cart_split_optimizer_tools.py`).
* **אחריות:**
  - מחשב האם פיצול סל לחבילות נפרדות עד `$75.00` חוסך 18% מע"מ גם לאחר עלות משלוח נוספת, או שעדיף לאחד לטובת משלוח חינם.

### 9. Trust, Guardrails & HITL Agent (`trust-guardrails-hitl-agent`)
* **תפקיד:** שומר סף אבטחה, מניעת הונאות וניהול אישור אנושי.
* **מודל:** סניטציית Python דטרמיניסטית + `gemini-3.5-flash-lite`.
* **כלים:** `guardrails_tools.py`, `notify_mcp.py` (`send_price_alert`, `dispatch_checkout_approval_card`).
* **אחריות:**
  - מנקה טקסטים חיצוניים מניסיונות Prompt Injection לפני הזנתם ל-LLM.
  - פוסל מוכרים עם `seller_trust_score < 70` (`BLOCKED_SCAM`).
  - אוכף שער אישור אנושי (HITL) משויך-`user_id` לפני כל פעולת הוספה לעגלה או Checkout.

---

## 3. עקרונות תקשורת, אבטחה ובידוד
* כל הסוכנים מחויבים להחזיר סכמות Pydantic v2 מוגדרות ב-`backend/app/api/schemas.py`.
* כל הרצת צוות מתבצעת תחת `UserContext` מאומת מ-JWT — חל איסור מוחלט לגשת ל-Watchlist, לאישורי Checkout או להיסטוריה של משתמש אחר.
* כל קריאת `gemini-3.5-flash-lite` מדווחת `input_tokens`, `output_tokens` ו-`cached_tokens` אל שכבת ה-Observability (OpenTelemetry / Langfuse) ולטבלת `user_search_history`.