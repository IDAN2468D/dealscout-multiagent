# 📅 Execution Plan & Milestones (PLAN) — DealScout AI (`dealscout-multiagent`) v2.1

תוכנית הפיתוח פרוסה על פני 5 ספרינטים דו-שבועיים (10 שבועות סה"כ) בשיטת Spec-Driven Development, עם `gemini-3.5-flash-lite` כמנוע ה-AI הראשי של צוות הסוכנים.

## Sprint 1: תשתיות, הרשמה/התחברות (Auth), RBAC ופרופיל קונה (שבועות 1–2)
**מטרה:** הקמת תשתית הקונטיינרים, מסד הנתונים, תצורת `google-genai` ושכבת אימות והרשאות מאובטחת.

* [ ] הקמת שלד הריפוזיטורי (`dealscout-multiagent/`), תיקיית `.agents/`, `backend/app/core/config.py` (כולל `GOOGLE_API_KEY` ו-`GEMINI_SUBAGENT_MODEL=gemini-3.5-flash-lite`) ו-`docker-compose.yml` (PostgreSQL, Redis, Elasticsearch, Kafka).
* [ ] יצירת מיגרציות PostgreSQL (Alembic) לכל הטבלאות: `users`, `refresh_tokens`, `user_buyer_profiles`, `user_search_history` (כולל `model_id`, `input_tokens`, `output_tokens`, `cached_tokens`, `llm_cost_usd`), `user_savings_ledger`, `coupon_feedback`, `price_history`, `watchlists`, `pending_approvals`, `audit_logs`.
* [ ] מימוש `backend/app/core/security.py`: הצפנת סיסמאות ב-`Argon2id`, `JWT Access Token`, `Refresh Token Rotation` ב-`HttpOnly Cookie` ורשימת ביטול ב-Redis.
* [ ] מימוש `backend/app/api/auth_routes.py` ו-`user_routes.py`: הרשמה, אימות מייל, התחברות, רענון, התנתקות, Google OAuth2 וניהול `UserBuyerProfile` (ארנק מועדוני אשראי).
* [ ] מימוש `UserContext` Dependency, אכיפת `RBAC` (`FREE` / `PRO` / `ADMIN`) ו-Rate Limiter ב-Redis Sliding Window.

**Definition of Done (Sprint 1):**
* בדיקות `pytest` מאמתות Register → Login → Refresh Rotation → Logout Revocation.
* חסימת `403` לפיצ'רי `PRO`, `429` בחריגת מכסה ו-100% מניעת IDOR בין משתמשים.

---

## Sprint 2: מנוע חיפוש, כלים דטרמיניסטיים ופיצול סל חכם (שבועות 3–4)
**מטרה:** בניית קטלוג החיפוש ב-Elasticsearch והכלים המתמטיים הדטרמיניסטיים (עלות סופית, מע"מ, פיצול סל והיסטוריית מחירים).

* [ ] מימוש `backend/app/search/elasticsearch_catalog.py`: אינדקס מוצרים, נרמול שמות דגמים וחיפוש Fuzzy.
* [ ] מימוש `backend/app/tools/landed_cost_tools.py`: המרת מט"ח (עם קאש ב-Redis), קיזוז קופונים ולוגיקת מע"מ 18% מעל 75 דולר.
* [ ] מימוש `backend/app/tools/cart_split_optimizer_tools.py`: אלגוריתם פיצול/איחוד חבילות לסל רב-פריטים לחיסכון במע"מ ודמי משלוח.
* [ ] מימוש `backend/app/tools/price_history_tools.py`: חישוב ממוצע 90 יום, שפל היסטורי וזיהוי Fake Discount (עלייה של מעל 15% לפני מבצע).
* [ ] מימוש `backend/app/tools/affiliate_tools.py`: הזרקת פרמטרי שותפים אוטומטית לקישורי חנויות מאומתים.
* [ ] הכנת Seed Data ריאליסטי ל-5 חנויות (Amazon, AliExpress, ASOS, eBay, KSP) כולל קופונים תקינים/פגי תוקף, מקרה Fake Discount ומוצר 110V.

**Definition of Done (Sprint 2):**
* בדיקות `pytest` מאמתות חיפוש Fuzzy, חישובי עלות מתחת ומעל 75 דולר בדיוק של אגורה, ואופטימיזציית פיצול סל שמציגה חיסכון מוכח.

---

## Sprint 3: שרתי MCP מודעי-משתמש, RAG + Gemini Context Caching ו-Guardrails (שבועות 5–6)
**מטרה:** בניית שלושת שרתי ה-MCP, מאגר ה-RAG עם Context Caching של Gemini, פידבק קהילתי ושכבת האבטחה ובדיקת התאימות.

* [ ] מימוש `backend/app/mcp_servers/ecommerce_mcp.py` (`FastMCP`) עם Caching, Rate Limiting ו-Timeout קשיח.
* [ ] מימוש `backend/app/mcp_servers/coupons_mcp.py` כולל חיבור למדד `success_rate` קהילתי ב-Redis (`POST /api/v1/coupons/{code}/feedback`).
* [ ] מימוש `backend/app/mcp_servers/notify_mcp.py` לשליחת התראות וכרטיסי אישור ל-Telegram/Slack/Email עם אימות בעלות `user_id` (ומצב Mock מקומי).
* [ ] בניית `backend/app/rag/promo_policy_store.py` (ChromaDB) + שכבת **Gemini Context Caching** לטעינת מדיניות מועדוני אשראי ו-System Prompts של `gemini-3.5-flash-lite` אחת לשעה.
* [ ] מימוש `backend/app/tools/guardrails_tools.py` (סניטציית Python דטרמיניסטית לפני שליחה ל-Gemini + דירוג אמינות מוכר) ו-`review_compatibility_tools.py` (בוטים ומתח `110V/220V`).

**Definition of Done (Sprint 3):**
* שלושת שרתי ה-MCP פועלים תקנית ואוכפים `UserContext`.
* Context Cache נטען ומפחית עלות טוקנים חוזרים; דיווחי קופון שליליים מורידים קופון שבור מהדירוג.
* שכבת ה-Guardrails חוסמת 100% ממקרי ה-Prompt Injection לפני הגעה ל-LLM ומתריעה על מוצר 110V.

---

## Sprint 4: תזמור 9 הסוכנים על `gemini-3.5-flash-lite`, מולטי-מודאל ו-Kafka (שבועות 7–8)
**מטרה:** חיבור צוות הסוכנים המלא תחת `DealOrchestratorAgent` על גבי `gemini-3.5-flash-lite`, זיכרון אישי, זיהוי מתמונה/URL ו-Kafka Watcher.

* [ ] מימוש `backend/app/agents/deal_orchestrator.py` ב-Agno עם `Gemini(id="gemini-3.5-flash-lite")`, הפעלת `search=True` בסוכן החיפוש, `url_context=True` ו-Vision בסוכן המולטי-מודאלי, והזרקת `UserBuyerProfile`.
* [ ] מימוש סוכן `multimodal-product-matcher` לחילוץ דגם ומק"ט מצילום מסך או קישור (`POST /api/v1/deals/match-from-image`).
* [ ] הטמעת זיכרון ארוך-טווח פר-משתמש (PostgreSQL + ChromaDB) ללמידת העדפות קנייה חוזרות.
* [ ] מימוש שער אישור אנושי (`PENDING_APPROVAL` → `APPROVED` / `REJECTED`) המשויך בלעדית למשתמש המחובר.
* [ ] בניית `backend/app/streaming/kafka_price_watcher.py` לניטור `price-drop-events` ושיגור התראות לפי Tier המשתמש.
* [ ] השלמת תיקיית `.agents/` כולל `Skills/*/SKILL.md` לכל 9 הסוכנים.

**Definition of Done (Sprint 4):**
* שאילתת טקסט או תמונה של משתמש מחובר מפעילה את `gemini-3.5-flash-lite` במקביל, משתמשת במועדוני האשראי שלו ומחזירה דירוג מאומת עם קישורי Affiliate ואזהרות.
* אירוע ירידת מחיר ב-Kafka מפעיל את הצוות ומשגר התראה לבעל ה-Watchlist בלבד.

---

## Sprint 5: FastAPI SSE, ארנק חיסכון, Observability לעלויות Gemini, Docker ואימות (שבועות 9–10)
**מטרה:** השלמת ממשקי ה-API, מדידת טוקנים ועלויות `gemini-3.5-flash-lite`, אריזת Docker ובדיקות קצה-לקצה.

* [ ] השלמת `backend/app/api/deal_routes.py` ו-`main.py` עם SSE Streaming מלא, נקודת קצה לפיצול סל וארנק חיסכון אישי (`GET /api/v1/users/me/savings`).
* [ ] שילוב **OpenTelemetry + Langfuse** למדידת זמני ריצה של כל סוכן, טוקני קלט/פלט/Cache ועלות ממוצעת של `gemini-3.5-flash-lite` לכל חיפוש.
* [ ] כתיבת `.agents/scripts/verify_dealscout_suite.py` לאימות אוטומטי של: קונפיגורציית `gemini-3.5-flash-lite`, Auth/JWT/RBAC, חסימת IDOR, חישוב מע"מ ופיצול סל, זיהוי Fake Discount, התראת 110V וחסימת Prompt Injection.
* [ ] אריזת `backend/Dockerfile` ואימות עלייה מלאה בפקודה אחת (`docker-compose up --build`).
* [ ] כתיבת תיעוד הפעלה ב-`README.md` וב-`.agents/docs/STEP_BY_STEP_EXECUTION_GUIDE.md` כולל תרחישי Demo מוכנים.

**Definition of Done (Sprint 5):**
* המערכת עולה בפקודה אחת ו-`/health` מחזיר סטטוס תקין לכל התשתיות.
* סקריפט `verify_dealscout_suite.py` עובר ב-100%.
* לוח ה-Observability מתעד עלויות וזמני תגובה תחת יעדי ה-SLA (`TTFT < 1.0s`, השלמה מלאה `< 4.5s`).