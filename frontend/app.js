/* DealScout AI — Frontend SPA Controller (RTL Hebrew) */

const state = {
  accessToken: localStorage.getItem("dealscout_access_token") || "",
  user: null,
  imageBase64: null,
  imageMimeType: "image/png",
  currentDeals: [],
  activeApproval: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message, type = "info") {
  const container = $("#toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.accessToken) {
    headers["Authorization"] = `Bearer ${state.accessToken}`;
  }
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && path !== "/api/v1/auth/login" && path !== "/api/v1/auth/refresh") {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${state.accessToken}`;
      return fetch(path, { ...options, headers, credentials: "include" });
    }
  }
  return res;
}

async function tryRefreshToken() {
  try {
    const res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access_token) {
      setAccessToken(data.access_token);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function setAccessToken(token) {
  state.accessToken = token || "";
  if (token) {
    localStorage.setItem("dealscout_access_token", token);
  } else {
    localStorage.removeItem("dealscout_access_token");
  }
}

async function parseError(res) {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((e) => e.msg || JSON.stringify(e)).join(" | ");
    }
    return data.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/* ==========================================================================
   Health & Auth State
   ========================================================================== */

async function checkHealth() {
  const pill = $("#health-indicator");
  try {
    const res = await fetch("/health");
    if (!res.ok) throw new Error("unhealthy");
    const data = await res.json();
    pill.className = "status-pill status-ok";
    pill.innerHTML = `<span class="dot"></span><span>שרת פעיל (${escHtml(data.model || "gemini-3.5-flash-lite")})</span>`;
  } catch {
    pill.className = "status-pill status-err";
    pill.innerHTML = `<span class="dot"></span><span>השרת לא זמין</span>`;
  }
}

async function loadCurrentUser() {
  const userBadge = $("#user-badge");
  const openAuthBtn = $("#open-auth-btn");
  const logoutBtn = $("#logout-btn");

  if (!state.accessToken) {
    state.user = null;
    userBadge.classList.add("hidden");
    openAuthBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    return;
  }

  try {
    const res = await apiFetch("/api/v1/users/me");
    if (!res.ok) {
      setAccessToken("");
      state.user = null;
      userBadge.classList.add("hidden");
      openAuthBtn.classList.remove("hidden");
      logoutBtn.classList.add("hidden");
      return;
    }
    const me = await res.json();
    state.user = me;
    $("#user-email-label").textContent = me.email;
    const tierEl = $("#user-tier-badge");
    tierEl.textContent = me.tier;
    tierEl.className = `tier-badge tier-${String(me.tier || "FREE").toLowerCase()}`;

    userBadge.classList.remove("hidden");
    openAuthBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");

    populateProfileForm(me.buyer_profile);
  } catch {
    /* ignore */
  }
}

function openAuthModal(defaultPanel = "login-panel") {
  $("#auth-modal").classList.remove("hidden");
  switchAuthPanel(defaultPanel);
}

function closeAuthModal() {
  $("#auth-modal").classList.add("hidden");
}

function switchAuthPanel(panelId) {
  $$(".auth-tab").forEach((b) => b.classList.toggle("active", b.dataset.authPanel === panelId));
  $$(".auth-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === panelId));
}

/* ==========================================================================
   Navigation Tabs
   ========================================================================== */

function setupNavigation() {
  $$(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      $$(".nav-tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === target));
      if (target === "watchlist-tab" && state.accessToken) {
        loadSavings();
        loadWatchlist();
      } else if (target === "profile-tab" && state.accessToken) {
        loadCurrentUser();
        loadSearchHistory();
      }
    });
  });
}

/* ==========================================================================
   Auth Forms
   ========================================================================== */

function setupAuthForms() {
  $("#open-auth-btn").addEventListener("click", () => openAuthModal("login-panel"));
  $("#close-auth-modal").addEventListener("click", closeAuthModal);
  $$(".auth-tab").forEach((b) => b.addEventListener("click", () => switchAuthPanel(b.dataset.authPanel)));

  $("#register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      full_name: $("#reg-name").value.trim(),
      email: $("#reg-email").value.trim(),
      password: $("#reg-password").value,
    };
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      showToast(await parseError(res), "err");
      return;
    }
    const data = await res.json();
    $("#verify-token").value = data.verification_token || "";
    $("#login-email").value = payload.email;
    $("#login-password").value = payload.password;
    showToast("נרשמת בהצלחה! טוקן האימות הוזן אוטומטית.", "ok");
    switchAuthPanel("verify-panel");
  });

  $("#verify-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: $("#verify-token").value.trim() }),
    });
    if (!res.ok) {
      showToast(await parseError(res), "err");
      return;
    }
    showToast("האימייל אומת בהצלחה! כעת ניתן להתחבר.", "ok");
    switchAuthPanel("login-panel");
  });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: $("#login-email").value.trim(),
        password: $("#login-password").value,
      }),
    });
    if (!res.ok) {
      showToast(await parseError(res), "err");
      return;
    }
    const data = await res.json();
    setAccessToken(data.access_token);
    closeAuthModal();
    await loadCurrentUser();
    showToast(`ברוך הבא, ${data.email} (${data.tier})`, "ok");
  });

  $("#logout-btn").addEventListener("click", async () => {
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    setAccessToken("");
    await loadCurrentUser();
    showToast("התנתקת מהמערכת", "info");
  });
}

/* ==========================================================================
   Live Deal Search via SSE (POST /api/v1/deals/search)
   ========================================================================== */

function appendSseEvent(eventType, payload) {
  const timeline = $("#sse-timeline");
  const empty = timeline.querySelector(".empty-state");
  if (empty) empty.remove();

  const el = document.createElement("div");
  let cls = "sse-event";
  let title = eventType;
  if (eventType === "warning_flag") {
    cls += " ev-warning";
    title = "⚠️ התראת אבטחה / תאימות";
  } else if (eventType === "tool_call") {
    cls += " ev-tool";
    title = `🛠️ כלי: ${payload.tool || payload.agent || "MCP"}`;
  } else if (eventType === "deal_ranked") {
    cls += " ev-deal";
    title = "💎 דיל מדורג";
  } else if (eventType === "final_report") {
    cls += " ev-final";
    title = "🏁 דוח סופי";
  } else if (eventType === "agent_step") {
    title = `🤖 ${payload.agent || "deal-orchestrator-agent"}`;
  }

  const msg =
    payload.message ||
    payload.summary ||
    payload.reason ||
    (payload.product_title ? `${payload.product_title} (${payload.store_name || ""})` : JSON.stringify(payload));

  el.className = cls;
  el.innerHTML = `
    <div class="sse-event-head">
      <span>${escHtml(title)}</span>
      <span class="mono">${new Date().toLocaleTimeString("he-IL")}</span>
    </div>
    <div>${escHtml(msg)}</div>
  `;
  timeline.appendChild(el);
  timeline.scrollTop = timeline.scrollHeight;
}

function verdictBadge(verdict) {
  switch (verdict) {
    case "GREAT_DEAL":
      return `<span class="badge badge-great">🔥 עסקה משתלמת (GREAT_DEAL)</span>`;
    case "FAKE_DISCOUNT":
      return `<span class="badge badge-fake">🚨 מבצע פיקטיבי (FAKE_DISCOUNT)</span>`;
    case "INCOMPATIBLE_SPEC":
      return `<span class="badge badge-incompat">⚡ אי-תאימות 110V (INCOMPATIBLE_SPEC)</span>`;
    case "BLOCKED_SCAM":
      return `<span class="badge badge-blocked">🛑 נחסם — הונאה (BLOCKED_SCAM)</span>`;
    default:
      return `<span class="badge badge-fair">✓ מחיר הוגן (FAIR_PRICE)</span>`;
  }
}

function renderDealCard(deal, idx) {
  const cb = deal.cost_breakdown || {};
  const coupons = Array.isArray(cb.applied_coupons) ? cb.applied_coupons : [];
  const warnings = Array.isArray(deal.compatibility_warnings) ? deal.compatibility_warnings : [];
  const verdict = deal.discount_verdict || "FAIR_PRICE";

  const couponsHtml = coupons.length
    ? coupons
        .map(
          (code) => `
      <span class="coupon-tag">
        <span class="mono">${escHtml(code)}</span>
        <button class="vote-btn" title="הקופון עבד" onclick="window.sendCouponVote('${escHtml(code)}','${escHtml(deal.store_name)}',true)">👍</button>
        <button class="vote-btn" title="הקופון לא עבד" onclick="window.sendCouponVote('${escHtml(code)}','${escHtml(deal.store_name)}',false)">👎</button>
      </span>`
        )
        .join("")
    : `<span class="muted small">ללא קופון פעיל</span>`;

  const vatIndicator = cb.vat_applied
    ? `<span class="badge badge-incompat">חייב במע"מ 18% (מעל $75): +$${Number(cb.vat_amount_usd || 0).toFixed(2)}</span>`
    : `<span class="badge badge-great">פטור ממע"מ 18% (עד $75) ✓</span>`;

  return `
    <article class="deal-card verdict-${escHtml(verdict)}">
      <div class="deal-top">
        ${verdictBadge(verdict)}
        <span class="badge badge-neutral">${escHtml(deal.store_name)}</span>
      </div>

      <h3 class="deal-title">${escHtml(deal.product_title)}</h3>

      <div class="deal-meta">
        <span>מוכר: <strong>${escHtml(deal.seller_name || "Official")}</strong> (אמינות ${escHtml(deal.seller_trust_score)}/100)</span>
        <span>מלאי: ${deal.in_stock ? "✅ זמין" : "❌ אזל"}</span>
        <span>שפל היסטורי: <strong class="mono">$${Number(deal.historical_low_usd || 0).toFixed(2)}</strong></span>
      </div>

      ${deal.fake_discount_flag ? `<div class="fake-box">🚨 זוהתה העלאת מחיר מלאכותית של מעל 15% לפני המבצע (ממוצע 90 יום: $${Number(deal.avg_90d_usd || 0).toFixed(2)}).</div>` : ""}

      ${warnings.map((w) => `<div class="warning-box">⚡ ${escHtml(w)}</div>`).join("")}

      <div class="cost-box">
        <div class="cost-row"><span>מחיר בסיס:</span><span class="mono">$${Number(cb.base_price_usd || 0).toFixed(2)}</span></div>
        <div class="cost-row"><span>הנחת קופונים ומועדונים:</span><span class="mono">-$${Number(cb.coupon_discount_usd || 0).toFixed(2)}</span></div>
        <div class="cost-row"><span>משלוח:</span><span class="mono">$${Number(cb.shipping_usd || 0).toFixed(2)}</span></div>
        <div class="cost-row"><span>סטטוס מס יבוא (IL):</span><span>${vatIndicator}</span></div>
        <div class="cost-row cost-total">
          <span>מחיר סופי עד הבית:</span>
          <span class="mono">₪${Number(cb.total_landed_ils || 0).toFixed(2)} ($${Number(cb.total_landed_usd || 0).toFixed(2)})</span>
        </div>
      </div>

      <div class="coupons-row">
        <span class="small muted">קופונים (דרג אמינות):</span>
        ${couponsHtml}
      </div>

      <div class="deal-actions">
        <button class="btn btn-primary btn-sm" type="button" onclick="window.initiateHitlCheckout(${idx})">🛡️ בצע Checkout באישור (HITL)</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="window.addDealToWatchlist(${idx})">⭐ הוסף ל-Watchlist</button>
        ${deal.product_id ? `<button class="btn btn-ghost btn-sm" type="button" onclick="window.openPriceHistory('${escHtml(deal.product_id)}')">📈 היסטוריית 90 יום</button>` : ""}
      </div>
    </article>
  `;
}

function renderDealsList(deals, container = $("#deals-grid")) {
  state.currentDeals = deals || [];
  if (!state.currentDeals.length) {
    container.innerHTML = `<div class="card empty-state-card"><h3>לא נמצאו עסקאות מאושרות</h3><p class="muted">ייתכן שכל ההצעות נחסמו ע"י שער האבטחה או לא עמדו בסינון התקציב.</p></div>`;
    return;
  }
  container.innerHTML = state.currentDeals.map((d, i) => renderDealCard(d, i)).join("");
}

async function runDealSearch(e) {
  if (e) e.preventDefault();
  if (!state.accessToken) {
    openAuthModal("login-panel");
    showToast("יש להתחבר כדי להפעיל את צוות הסוכנים", "warn");
    return;
  }

  const query = $("#search-query").value.trim();
  const maxBudget = $("#search-budget").value ? Number($("#search-budget").value) : null;
  const overrideShipTo = $("#search-ship-to").value || null;

  $("#sse-timeline").innerHTML = "";
  $("#final-report-banner").classList.add("hidden");
  $("#deals-grid").innerHTML = `<div class="card empty-state-card"><h3>⚡ צוות הסוכנים מריץ סריקה מקבילית...</h3></div>`;
  const sseBadge = $("#sse-status-badge");
  sseBadge.className = "badge badge-great";
  sseBadge.textContent = "מזרים SSE...";

  const collectedDeals = [];

  try {
    const res = await apiFetch("/api/v1/deals/search", {
      method: "POST",
      body: JSON.stringify({
        query,
        max_budget_ils: maxBudget,
        override_ship_to: overrideShipTo,
        use_saved_profile: true,
      }),
    });

    if (!res.ok) {
      sseBadge.className = "badge badge-fake";
      sseBadge.textContent = `שגיאה ${res.status}`;
      showToast(await parseError(res), "err");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const processFrame = (rawFrame) => {
      const lines = rawFrame.split(/\r?\n/);
      let eventName = "message";
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (!dataLines.length) return;
      const dataStr = dataLines.join("\n");
      let payload;
      try {
        payload = JSON.parse(dataStr);
      } catch {
        payload = { message: dataStr };
      }

      const ev = payload.event || eventName;
      appendSseEvent(ev, payload);

      if (ev === "deal_ranked") {
        if (payload.deal) collectedDeals.push(payload.deal);
        else if (payload.product_title) collectedDeals.push(payload);
        renderDealsList(collectedDeals);
      } else if (ev === "final_report") {
        const finalDeals = payload.deals || payload.ranked_deals || payload.results || collectedDeals;
        renderDealsList(finalDeals);
        const banner = $("#final-report-banner");
        banner.classList.remove("hidden");
        const blocked = payload.blocked_count ?? payload.blocked_scams?.length ?? 0;
        banner.innerHTML = `
          <div class="card-header" style="margin-bottom:0">
            <div>
              <h3>🏁 סיכום הרצת סוכנים</h3>
              <p class="muted" style="margin:0">${escHtml(payload.summary || `אותרו ${finalDeals.length} עסקאות מאושרות (${blocked} מוכרים חשודים נחסמו).`)}</p>
            </div>
            <span class="badge badge-great">${finalDeals.length} תוצאות</span>
          </div>
        `;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        if (frame.trim()) processFrame(frame);
      }
    }
    if (buffer.trim()) processFrame(buffer);

    sseBadge.className = "badge badge-neutral";
    sseBadge.textContent = "הושלם ✓";
  } catch (err) {
    sseBadge.className = "badge badge-fake";
    sseBadge.textContent = "שגיאה";
    showToast(`שגיאת חיבור SSE: ${err.message}`, "err");
  }
}

/* ==========================================================================
   HITL Checkout, Watchlist, Price History & Coupon Feedback
   ========================================================================== */

window.initiateHitlCheckout = async (idx) => {
  const deal = state.currentDeals[idx];
  if (!deal) return;
  const cb = deal.cost_breakdown || {};
  const res = await apiFetch("/api/v1/deals/checkout/initiate", {
    method: "POST",
    body: JSON.stringify({
      product_id: deal.product_id || deal.sku || "UNKNOWN",
      sku: deal.sku || deal.product_id || "UNKNOWN",
      product_title: deal.product_title,
      store_name: deal.store_name,
      affiliate_url: deal.affiliate_url || deal.product_url,
      total_landed_usd: Number(cb.total_landed_usd || 1),
      total_landed_ils: Number(cb.total_landed_ils || 1),
      applied_coupons: cb.applied_coupons || [],
    }),
  });
  if (!res.ok) {
    showToast(await parseError(res), "err");
    return;
  }
  const approval = await res.json();
  state.activeApproval = approval;
  renderHitlModal(approval);
};

function renderHitlModal(approval) {
  const body = $("#hitl-modal-body");
  const isPending = approval.status === "PENDING_APPROVAL";
  const isApproved = approval.status === "APPROVED";

  body.innerHTML = `
    <div class="cost-box">
      <div class="cost-row"><span>מזהה אישור:</span><span class="mono">${escHtml(approval.approval_id)}</span></div>
      <div class="cost-row"><span>מוצר:</span><strong>${escHtml(approval.product_title)}</strong></div>
      <div class="cost-row"><span>חנות:</span><span>${escHtml(approval.store_name)}</span></div>
      <div class="cost-row"><span>סכום סופי:</span><strong class="mono">₪${Number(approval.total_landed_ils).toFixed(2)}</strong></div>
      <div class="cost-row"><span>סטטוס:</span><span class="badge ${isApproved ? "badge-great" : isPending ? "badge-incompat" : "badge-fake"}">${escHtml(approval.status)}</span></div>
    </div>
    <p class="small muted">${escHtml(approval.message)}</p>
    ${
      isPending
        ? `
      <div class="input-group">
        <label for="hitl-note">הערת משתמש (אופציונלי)</label>
        <input id="hitl-note" type="text" placeholder="לדוגמה: מאשר רכישה עם כרטיס הייטקזון" />
      </div>
      <div class="deal-actions">
        <button class="btn btn-success" type="button" onclick="window.decideHitlCheckout('${escHtml(approval.approval_id)}','APPROVED')">✅ אשר Checkout</button>
        <button class="btn btn-danger" type="button" onclick="window.decideHitlCheckout('${escHtml(approval.approval_id)}','REJECTED')">❌ דחה בקשה</button>
      </div>`
        : isApproved
        ? `<a class="btn btn-primary" href="${escHtml(approval.affiliate_url)}" target="_blank" rel="noopener noreferrer">מעבר לקישור השותפים המאומת ↗</a>`
        : ""
    }
  `;
  $("#hitl-modal").classList.remove("hidden");
}

window.decideHitlCheckout = async (approvalId, decision) => {
  const noteEl = $("#hitl-note");
  const res = await apiFetch("/api/v1/deals/approve-checkout", {
    method: "POST",
    body: JSON.stringify({
      approval_id: approvalId,
      decision,
      user_note: noteEl ? noteEl.value.trim() || null : null,
    }),
  });
  if (!res.ok) {
    showToast(await parseError(res), "err");
    return;
  }
  const updated = await res.json();
  renderHitlModal(updated);
  showToast(decision === "APPROVED" ? "Checkout אושר ונרשם!" : "Checkout נדחה", decision === "APPROVED" ? "ok" : "warn");
};

window.addDealToWatchlist = async (idx) => {
  const deal = state.currentDeals[idx];
  if (!deal) return;
  const cb = deal.cost_breakdown || {};
  const targetUsd = Math.max(1, Math.round((cb.base_price_usd || 100) * 0.9));
  const res = await apiFetch("/api/v1/watchlist", {
    method: "POST",
    body: JSON.stringify({
      product_id: deal.product_id || deal.sku,
      sku: deal.sku || deal.product_id,
      product_title: deal.product_title,
      store_name: deal.store_name,
      target_price_usd: targetUsd,
    }),
  });
  if (!res.ok) {
    showToast(await parseError(res), "err");
    return;
  }
  showToast(`נוסף למעקב במחיר יעד $${targetUsd}`, "ok");
};

window.openPriceHistory = async (productId) => {
  const res = await apiFetch(`/api/v1/deals/${encodeURIComponent(productId)}/history`);
  if (!res.ok) {
    showToast(await parseError(res), "err");
    return;
  }
  const h = await res.json();
  const pointsHtml = (h.points || [])
    .slice(-12)
    .reverse()
    .map(
      (p) => `
    <div class="list-row">
      <span>${escHtml(p.store_name)}</span>
      <span class="mono">$${Number(p.price_usd).toFixed(2)}</span>
      <span class="muted small">${new Date(p.recorded_at).toLocaleDateString("he-IL")}</span>
    </div>`
    )
    .join("");

  $("#history-modal-body").innerHTML = `
    <div class="stat-grid">
      <div class="stat-box"><div class="muted small">מחיר נוכחי</div><div class="stat-val mono">$${Number(h.current_price_usd).toFixed(2)}</div></div>
      <div class="stat-box"><div class="muted small">ממוצע 90 יום</div><div class="stat-val mono">$${Number(h.avg_90d_usd).toFixed(2)}</div></div>
      <div class="stat-box"><div class="muted small">שפל היסטורי</div><div class="stat-val mono">$${Number(h.historical_low_usd).toFixed(2)}</div></div>
      <div class="stat-box"><div class="muted small">קפיצת מחיר 30 יום</div><div class="stat-val mono">${Number(h.spike_pct).toFixed(1)}%</div></div>
    </div>
    ${h.fake_discount_flag ? `<div class="fake-box">🚨 זוהה Fake Discount: המחיר זינק מעל 15% לפני המבצע (שיא 30 יום: $${Number(h.max_30d_pre_sale_usd).toFixed(2)}).</div>` : `<div class="alert alert-success">✓ היסטוריית מחירים תקינה ללא עלייה מלאכותית.</div>`}
    <div class="stack-gap">${pointsHtml || '<div class="muted">אין נקודות תמחור היסטוריות.</div>'}</div>
  `;
  $("#history-modal").classList.remove("hidden");
};

window.sendCouponVote = async (code, storeName, worked) => {
  if (!state.accessToken) {
    openAuthModal("login-panel");
    return;
  }
  const res = await apiFetch(`/api/v1/coupons/${encodeURIComponent(code)}/feedback`, {
    method: "POST",
    body: JSON.stringify({ store_name: storeName, worked }),
  });
  if (!res.ok) {
    showToast(await parseError(res), "err");
    return;
  }
  const data = await res.json();
  const pct = Math.round(data.success_rate * 100);
  showToast(`תודה! ציון הקופון ${data.coupon_code}: ${pct}% (${data.total_votes} הצבעות)${data.suppressed ? " — הקופון הוסר!" : ""}`, data.suppressed ? "warn" : "ok");
};

/* ==========================================================================
   Smart Cart Tax-Split Optimizer (PRO)
   ========================================================================== */

function addCartItemRow(item = { sku: "", title: "", store_name: "Amazon", unit_price_usd: 35, quantity: 1 }) {
  const list = $("#cart-items-list");
  const row = document.createElement("div");
  row.className = "cart-item-row";
  row.innerHTML = `
    <input class="ci-sku" type="text" placeholder="SKU" value="${escHtml(item.sku)}" required />
    <input class="ci-title" type="text" placeholder="שם מוצר" value="${escHtml(item.title)}" required />
    <input class="ci-store" type="text" placeholder="חנות" value="${escHtml(item.store_name)}" required />
    <input class="ci-price" type="number" step="0.01" min="0.5" placeholder="מחיר $" value="${item.unit_price_usd}" required />
    <input class="ci-qty" type="number" min="1" placeholder="כמות" value="${item.quantity}" required />
    <button class="btn btn-danger btn-sm" type="button" onclick="this.parentElement.remove()">✕</button>
  `;
  list.appendChild(row);
}

function loadCartPreset(type) {
  const list = $("#cart-items-list");
  list.innerHTML = "";
  if (type === "asos") {
    $("#cart-store").value = "ASOS";
    addCartItemRow({ sku: "ASOS-HOODIE", title: "ASOS Oversized Hoodie", store_name: "ASOS", unit_price_usd: 42, quantity: 1 });
    addCartItemRow({ sku: "ASOS-JEANS", title: "ASOS Slim Fit Jeans", store_name: "ASOS", unit_price_usd: 48, quantity: 1 });
  } else {
    $("#cart-store").value = "Amazon";
    addCartItemRow({ sku: "ANKER-GAN65", title: "Anker Nano II 65W Charger", store_name: "Amazon", unit_price_usd: 39, quantity: 1 });
    addCartItemRow({ sku: "LOGI-MX3S", title: "Logitech MX Master 3S", store_name: "Amazon", unit_price_usd: 72, quantity: 1 });
    addCartItemRow({ sku: "UGREEN-HUB7", title: "UGREEN USB-C Hub 7-in-1", store_name: "Amazon", unit_price_usd: 34, quantity: 1 });
  }
}

function setupCartSplit() {
  loadCartPreset("tech");
  $("#add-cart-item-btn").addEventListener("click", () => addCartItemRow());
  $("#load-cart-preset-tech").addEventListener("click", () => loadCartPreset("tech"));
  $("#load-cart-preset-asos").addEventListener("click", () => loadCartPreset("asos"));

  $("#cart-split-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.accessToken) {
      openAuthModal("login-panel");
      return;
    }
    const items = $$(".cart-item-row").map((r) => ({
      sku: r.querySelector(".ci-sku").value.trim(),
      title: r.querySelector(".ci-title").value.trim(),
      store_name: r.querySelector(".ci-store").value.trim(),
      unit_price_usd: Number(r.querySelector(".ci-price").value),
      quantity: Number(r.querySelector(".ci-qty").value),
    }));

    const res = await apiFetch("/api/v1/cart/optimize-split", {
      method: "POST",
      body: JSON.stringify({
        store_name: $("#cart-store").value.trim(),
        items,
        shipping_per_package_usd: Number($("#cart-shipping-fee").value || 0),
        free_shipping_threshold_usd: $("#cart-free-threshold").value ? Number($("#cart-free-threshold").value) : null,
        ship_to_country: $("#cart-ship-to").value,
      }),
    });

    const box = $("#cart-split-result");
    box.classList.remove("hidden");
    if (!res.ok) {
      const msg = await parseError(res);
      box.innerHTML = `<div class="alert alert-danger">⛔ ${escHtml(msg)} (פיצול סל פתוח למנויי PRO / ADMIN)</div>`;
      return;
    }

    const d = await res.json();
    const pkgsHtml = (d.packages || [])
      .map(
        (p) => `
      <div class="package-card">
        <div class="deal-top">
          <strong>חבילה #${p.package_index}</strong>
          <span class="badge ${p.vat_applied ? "badge-incompat" : "badge-great"}">${p.vat_applied ? `מע"מ 18%: $${p.vat_amount_usd.toFixed(2)}` : "פטור ממע\"מ ✓"}</span>
        </div>
        <p class="small muted">${(p.items || []).map(escHtml).join(", ")}</p>
        <div class="cost-row"><span>פריטים:</span><span class="mono">$${p.items_subtotal_usd.toFixed(2)}</span></div>
        <div class="cost-row"><span>משלוח:</span><span class="mono">$${p.shipping_usd.toFixed(2)}</span></div>
        <div class="cost-row cost-total"><span>סה״כ חבילה:</span><span class="mono">₪${p.package_total_ils.toFixed(2)} ($${p.package_total_usd.toFixed(2)})</span></div>
      </div>`
      )
      .join("");

    box.innerHTML = `
      <div class="alert alert-success">
        <strong>המלצה: ${d.recommended_strategy === "SPLIT_PACKAGES" ? "פצל חבילות לחיסכון במע\"מ" : "אחד למשלוח בודד"}</strong> —
        חיסכון נטו: <strong class="mono">₪${d.saved_ils.toFixed(2)} ($${d.saved_usd.toFixed(2)})</strong>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><div class="muted small">משלוח מאוחד (בסיס)</div><div class="stat-val mono">₪${d.baseline_combined_ils.toFixed(2)}</div></div>
        <div class="stat-box"><div class="muted small">מע"מ במשלוח מאוחד</div><div class="stat-val mono">$${d.baseline_vat_usd.toFixed(2)}</div></div>
        <div class="stat-box"><div class="muted small">סך הכל לאחר אופטימיזציה</div><div class="stat-val mono">₪${d.optimized_total_ils.toFixed(2)}</div></div>
      </div>
      <p class="small">${escHtml(d.explanation)}</p>
      <div class="packages-grid">${pkgsHtml}</div>
    `;
  });
}

/* ==========================================================================
   Multimodal Image / URL Matcher (PRO)
   ========================================================================== */

function setupMultimodal() {
  $("#load-multimodal-preset-btn").addEventListener("click", () => {
    $("#mm-url").value = "https://www.amazon.com/dp/B09XS7JWHH";
    $("#mm-hint").value = "Sony WH-1000XM5 Wireless Headphones";
  });

  $("#mm-file-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    state.imageMimeType = file.type || "image/png";
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIdx = result.indexOf(",");
      state.imageBase64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      const img = $("#mm-preview-img");
      img.src = result;
      img.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  $("#mm-clear-btn").addEventListener("click", () => {
    $("#mm-url").value = "";
    $("#mm-hint").value = "";
    $("#mm-file-input").value = "";
    state.imageBase64 = null;
    $("#mm-preview-img").classList.add("hidden");
    $("#multimodal-result").classList.add("hidden");
  });

  $("#multimodal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.accessToken) {
      openAuthModal("login-panel");
      return;
    }
    const res = await apiFetch("/api/v1/deals/match-from-image", {
      method: "POST",
      body: JSON.stringify({
        product_url: $("#mm-url").value.trim() || null,
        image_base64: state.imageBase64,
        image_mime_type: state.imageMimeType,
        hint_text: $("#mm-hint").value.trim() || null,
      }),
    });

    const box = $("#multimodal-result");
    box.classList.remove("hidden");
    if (!res.ok) {
      const msg = await parseError(res);
      box.innerHTML = `<div class="alert alert-danger">⛔ ${escHtml(msg)} (זיהוי מולטי-מודאלי פתוח למנויי PRO / ADMIN)</div>`;
      return;
    }

    const m = await res.json();
    box.innerHTML = `
      <div class="alert alert-success">
        זוהה מוצר: <strong>${escHtml(m.detected_brand)} ${escHtml(m.detected_model)}</strong>
        (SKU: <span class="mono">${escHtml(m.detected_sku)}</span> | ביטחון: ${Math.round((m.confidence || 0) * 100)}% | שיטה: ${escHtml(m.extraction_method)})
      </div>
      <div id="mm-deals-grid" class="deals-grid"></div>
    `;
    renderDealsList(m.matched_deals || [], $("#mm-deals-grid"));
  });
}

/* ==========================================================================
   Watchlist, Savings, Coupons & Kafka Trigger
   ========================================================================== */

async function loadSavings() {
  const box = $("#savings-summary-box");
  const res = await apiFetch("/api/v1/users/me/savings");
  if (!res.ok) return;
  const s = await res.json();
  const entries = (s.recent_entries || [])
    .map(
      (en) => `
    <div class="list-row">
      <span><strong>${escHtml(en.source_type)}</strong> — ${escHtml(en.description || en.reference_sku || "")}</span>
      <span class="mono" style="color:#34d399">+₪${Number(en.saved_ils).toFixed(2)}</span>
    </div>`
    )
    .join("");

  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat-box"><div class="muted small">סה״כ חיסכון (₪)</div><div class="stat-val mono">₪${Number(s.total_saved_ils).toFixed(2)}</div></div>
      <div class="stat-box"><div class="muted small">סה״כ חיסכון ($)</div><div class="stat-val mono">$${Number(s.total_saved_usd).toFixed(2)}</div></div>
    </div>
    <div class="stack-gap">${entries || '<div class="muted small">טרם נרשמו פעולות חיסכון.</div>'}</div>
  `;
}

async function loadWatchlist() {
  const list = $("#watchlist-list");
  const res = await apiFetch("/api/v1/watchlist");
  if (!res.ok) return;
  const items = await res.json();
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">רשימת המעקב ריקה.</div>`;
    return;
  }
  list.innerHTML = items
    .map(
      (w) => `
    <div class="list-row">
      <div>
        <strong>${escHtml(w.product_title)}</strong>
        <span class="muted small"> (${escHtml(w.store_name || "כל החנויות")} | <span class="mono">${escHtml(w.sku)}</span>)</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge badge-fair">יעד: ${w.target_price_usd ? `$${w.target_price_usd}` : `₪${w.target_price_ils}`}</span>
        <button class="btn btn-danger btn-sm" type="button" onclick="window.deleteWatchlistItem('${escHtml(w.id)}')">מחק</button>
      </div>
    </div>`
    )
    .join("");
}

window.deleteWatchlistItem = async (id) => {
  const res = await apiFetch(`/api/v1/watchlist/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    showToast(await parseError(res), "err");
    return;
  }
  showToast("הפריט הוסר מרשימת המעקב", "info");
  loadWatchlist();
};

function setupWatchlistAndCoupons() {
  $("#refresh-savings-btn").addEventListener("click", loadSavings);
  $("#refresh-watchlist-btn").addEventListener("click", loadWatchlist);

  $$(".coupon-chip").forEach((c) => {
    c.addEventListener("click", () => {
      $("#cf-code").value = c.dataset.code;
      $("#cf-store").value = c.dataset.store;
    });
  });

  $("#coupon-feedback-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.accessToken) return openAuthModal("login-panel");
    const code = $("#cf-code").value.trim();
    const res = await apiFetch(`/api/v1/coupons/${encodeURIComponent(code)}/feedback`, {
      method: "POST",
      body: JSON.stringify({
        store_name: $("#cf-store").value.trim(),
        worked: $("#cf-worked").value === "true",
        cart_total_usd: $("#cf-cart-total").value ? Number($("#cf-cart-total").value) : null,
      }),
    });
    const out = $("#coupon-feedback-result");
    out.classList.remove("hidden");
    if (!res.ok) {
      out.innerHTML = `<div class="alert alert-danger">${escHtml(await parseError(res))}</div>`;
      return;
    }
    const d = await res.json();
    out.innerHTML = `<div class="alert ${d.suppressed ? "alert-danger" : "alert-success"}">קופון <strong class="mono">${escHtml(d.coupon_code)}</strong>: הצלחה ${Math.round(d.success_rate * 100)}% (${d.total_votes} הצבעות)${d.suppressed ? " — הקופון סומן כמושבת (<35%)" : ""}</div>`;
  });

  $("#watchlist-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.accessToken) return openAuthModal("login-panel");
    const res = await apiFetch("/api/v1/watchlist", {
      method: "POST",
      body: JSON.stringify({
        product_id: $("#wl-product-id").value.trim(),
        sku: $("#wl-sku").value.trim(),
        product_title: $("#wl-title").value.trim(),
        store_name: $("#wl-store").value.trim() || null,
        target_price_usd: $("#wl-target-usd").value ? Number($("#wl-target-usd").value) : null,
      }),
    });
    if (!res.ok) {
      showToast(await parseError(res), "err");
      return;
    }
    showToast("נוסף לרשימת המעקב", "ok");
    loadWatchlist();
  });

  $("#kafka-trigger-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.accessToken) return openAuthModal("login-panel");
    const res = await apiFetch("/api/v1/deals/price-drop", {
      method: "POST",
      body: JSON.stringify({
        product_id: $("#kf-product-id").value.trim(),
        sku: $("#kf-sku").value.trim(),
        store_name: $("#kf-store").value.trim(),
        new_price_usd: Number($("#kf-price-usd").value),
      }),
    });
    const out = $("#kafka-trigger-result");
    out.classList.remove("hidden");
    if (!res.ok) {
      out.innerHTML = `<div class="alert alert-danger">${escHtml(await parseError(res))}</div>`;
      return;
    }
    const data = await res.json();
    out.innerHTML = `<div class="alert alert-success">אירוע Kafka עובד! נשלחו התראות: <span class="mono">${escHtml(JSON.stringify(data))}</span></div>`;
  });
}

/* ==========================================================================
   Profile & History
   ========================================================================== */

function populateProfileForm(p) {
  if (!p) return;
  $("#prof-currency").value = p.preferred_currency || "ILS";
  $("#prof-country").value = p.ship_to_country || "IL";
  $("#prof-min-trust").value = p.min_seller_trust ?? 75;
  $("#prof-stores").value = (p.preferred_stores || []).join(", ");
  $("#prof-telegram").value = p.telegram_chat_id || "";

  const clubs = new Set(p.credit_card_clubs || []);
  $$('input[name="club"]').forEach((cb) => (cb.checked = clubs.has(cb.value)));

  const channels = new Set(p.notification_channels || ["email"]);
  $$('input[name="channel"]').forEach((cb) => (cb.checked = channels.has(cb.value)));
}

async function loadSearchHistory() {
  const box = $("#search-history-list");
  const res = await apiFetch("/api/v1/users/me/history");
  if (!res.ok) return;
  const rows = await res.json();
  if (!rows.length) {
    box.innerHTML = `<div class="empty-state">אין היסטוריית חיפושים עדיין.</div>`;
    return;
  }
  box.innerHTML = rows
    .map(
      (r) => `
    <div class="list-row">
      <div>
        <strong>${escHtml(r.query)}</strong>
        <div class="muted small mono">${escHtml(r.model_id)} | in:${r.input_tokens} out:${r.output_tokens} cached:${r.cached_tokens} | $${Number(r.llm_cost_usd).toFixed(5)}</div>
      </div>
      <div class="mono">${r.best_landed_ils ? `₪${Number(r.best_landed_ils).toFixed(2)}` : "—"} (${Math.round(r.duration_ms)}ms)</div>
    </div>`
    )
    .join("");
}

function setupProfile() {
  $("#refresh-profile-btn").addEventListener("click", loadCurrentUser);
  $("#refresh-history-btn").addEventListener("click", loadSearchHistory);

  $("#profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.accessToken) return openAuthModal("login-panel");

    const clubs = $$('input[name="club"]:checked').map((cb) => cb.value);
    const channels = $$('input[name="channel"]:checked').map((cb) => cb.value);
    const stores = $("#prof-stores")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await apiFetch("/api/v1/users/me/profile", {
      method: "PUT",
      body: JSON.stringify({
        preferred_currency: $("#prof-currency").value,
        ship_to_country: $("#prof-country").value,
        credit_card_clubs: clubs,
        preferred_stores: stores,
        min_seller_trust: Number($("#prof-min-trust").value),
        notification_channels: channels.length ? channels : ["email"],
        telegram_chat_id: $("#prof-telegram").value.trim() || null,
      }),
    });

    if (!res.ok) {
      showToast(await parseError(res), "err");
      return;
    }
    showToast("פרופיל הקונה וארנק המועדונים נשמרו!", "ok");
  });
}

/* ==========================================================================
   Init
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupAuthForms();
  setupCartSplit();
  setupMultimodal();
  setupWatchlistAndCoupons();
  setupProfile();

  $("#deal-search-form").addEventListener("submit", runDealSearch);
  $$(".preset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $("#search-query").value = chip.dataset.query;
      runDealSearch();
    });
  });

  $("#close-hitl-modal").addEventListener("click", () => $("#hitl-modal").classList.add("hidden"));
  $("#close-history-modal").addEventListener("click", () => $("#history-modal").classList.add("hidden"));

  checkHealth();
  loadCurrentUser();
});
