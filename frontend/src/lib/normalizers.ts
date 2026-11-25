import type {
  AgentId,
  AgentStreamEvent,
  CouponInfo,
  DealCandidate,
  SSEEventType,
  UserProfile,
  UserRole,
} from "@/types/api";

const KNOWN_CLUB_CODES: Record<string, { club?: string; desc: string; rate: number }> = {
  HTZ12: { club: "HitechZone", desc: "12% הנחת מועדון הייטקזון", rate: 95 },
  HEVER15: { club: "Hever", desc: "15% הנחת מועדון חבר", rate: 94 },
  FLYCARD10: { club: "FlyCard", desc: "10% הנחת FlyCard", rate: 91 },
  MAX8: { club: "Max", desc: "8% הנחת מועדון Max", rate: 89 },
  ISRA10: { club: "Isracard", desc: "10% הנחת ישראכרט", rate: 90 },
  WELCOME10: { desc: "10% הנחת פתיחה", rate: 92 },
  SAVE15: { desc: "$15 הנחה מעל $100", rate: 88 },
  ASOS20: { desc: "20% הנחת ASOS", rate: 84 },
};

export function normalizeUserProfile(raw: Record<string, unknown>): UserProfile {
  const bp = (raw.buyer_profile as Record<string, unknown> | undefined) || raw;
  const role = String(raw.tier || raw.role || "FREE").toUpperCase() as UserRole;
  const defaultLimit = role === "ADMIN" ? 9999 : role === "PRO" ? 60 : 10;

  return {
    user_id: String(raw.user_id || bp.user_id || ""),
    email: String(raw.email || ""),
    full_name: String(raw.full_name || ""),
    role,
    tier: role,
    is_verified: Boolean(raw.is_verified ?? true),
    daily_searches_used: Number(raw.daily_searches_used ?? 0),
    daily_searches_limit: Number(raw.daily_searches_limit ?? defaultLimit),
    preferred_currency: (bp.preferred_currency as "ILS" | "USD" | "EUR") || "ILS",
    ship_to_country: String(bp.ship_to_country || "IL"),
    credit_card_clubs: Array.isArray(bp.credit_card_clubs)
      ? bp.credit_card_clubs.map(String)
      : [],
    preferred_stores: Array.isArray(bp.preferred_stores)
      ? bp.preferred_stores.map(String)
      : [],
    min_seller_trust: Number(bp.min_seller_trust ?? 75),
    notification_channels: Array.isArray(bp.notification_channels)
      ? (bp.notification_channels as UserProfile["notification_channels"])
      : ["email"],
    telegram_chat_id: (bp.telegram_chat_id as string | null) ?? null,
    long_term_preferences:
      (bp.long_term_preferences as UserProfile["long_term_preferences"]) || {},
  };
}

export function normalizeCoupon(raw: string | Partial<CouponInfo>): CouponInfo {
  if (typeof raw === "string") {
    const code = raw.trim().toUpperCase();
    const meta = KNOWN_CLUB_CODES[code];
    return {
      code,
      discount_description: meta?.desc || `קופון ${code}`,
      verified: true,
      success_rate: meta?.rate ?? 90,
      club_required: meta?.club,
    };
  }
  const code = String(raw.code || "").trim().toUpperCase();
  const meta = KNOWN_CLUB_CODES[code];
  const rateVal = Number(raw.success_rate ?? meta?.rate ?? 90);
  return {
    code,
    discount_description: raw.discount_description || meta?.desc || `קופון ${code}`,
    verified: Boolean(raw.verified ?? true),
    success_rate: rateVal <= 1 ? Math.round(rateVal * 100) : Math.round(rateVal),
    club_required: raw.club_required ?? meta?.club,
  };
}

export function normalizeDealCandidate(raw: Record<string, unknown>): DealCandidate {
  const cb = (raw.cost_breakdown as Record<string, unknown> | undefined) || {};
  const rawCoupons = Array.isArray(cb.applied_coupons) ? cb.applied_coupons : [];
  const totalUsd = Number(cb.total_landed_usd ?? 0);
  const totalIls = Number(cb.total_landed_ils ?? 0);
  const fx =
    Number(cb.fx_rate_ils) ||
    (totalUsd > 0 ? Number((totalIls / totalUsd).toFixed(2)) : 3.65);

  const productId = String(raw.product_id || raw.sku || raw.deal_id || "");
  const storeName = String(raw.store_name || "");

  return {
    deal_id: String(raw.deal_id || `${productId}-${storeName}`).replace(/\s+/g, "-"),
    product_id: productId,
    sku: String(raw.sku || productId),
    store_name: storeName,
    product_title: String(raw.product_title || ""),
    product_url: String(raw.product_url || ""),
    affiliate_url: String(raw.affiliate_url || raw.product_url || ""),
    image_url: typeof raw.image_url === "string" ? raw.image_url : undefined,
    seller_name: String(raw.seller_name || "Official Store"),
    seller_trust_score: Number(raw.seller_trust_score ?? 85),
    in_stock: Boolean(raw.in_stock ?? true),
    fake_discount_flag: Boolean(raw.fake_discount_flag),
    compatibility_warnings: Array.isArray(raw.compatibility_warnings)
      ? raw.compatibility_warnings.map(String)
      : [],
    discount_verdict: (raw.discount_verdict as DealCandidate["discount_verdict"]) || "FAIR_PRICE",
    historical_low_usd: Number(raw.historical_low_usd ?? 0),
    avg_90d_usd: Number(raw.avg_90d_usd ?? 0),
    cost_breakdown: {
      base_price_usd: Number(cb.base_price_usd ?? 0),
      coupon_discount_usd: Number(cb.coupon_discount_usd ?? 0),
      applied_coupons: rawCoupons.map(normalizeCoupon),
      shipping_usd: Number(cb.shipping_usd ?? 0),
      vat_applied: Boolean(cb.vat_applied),
      vat_amount_usd: Number(cb.vat_amount_usd ?? 0),
      total_landed_usd: totalUsd,
      total_landed_ils: totalIls,
      fx_rate_ils: fx,
    },
  };
}

export function normalizeSSEFrame(
  eventType: string,
  payload: Record<string, unknown>,
): AgentStreamEvent {
  const type = (eventType || "agent_step") as SSEEventType;
  const agentId = (payload.agent ||
    payload.agent_id ||
    (type === "warning_flag"
      ? "trust-guardrails-hitl-agent"
      : type === "deal_ranked"
        ? "landed-cost-calculator"
        : "deal-orchestrator-agent")) as AgentId;

  let message = String(payload.message || "");
  if (!message) {
    if (type === "agent_step") {
      message =
        payload.status === "started"
          ? `מתחיל חיפוש מקבילי עבור "${String(payload.query || "")}"...`
          : `מבקר היסטוריית מחירים ותאימות (${String(payload.offers_to_audit || 0)} הצעות)`;
    } else if (type === "tool_call") {
      message = `הופעל כלי ${String(payload.tool || "MCP")}: נמצאו ${String(payload.offers_found ?? 0)} הצעות`;
    } else if (type === "deal_ranked") {
      message = `דורג במקום #${String(payload.rank || 1)}: ${String(payload.store_name || "")} — ${String(payload.product_title || "")}`;
    } else if (type === "final_report") {
      message = String(payload.summary || "החיפוש והדירוג הושלמו בהצלחה.");
    }
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp: new Date().toISOString(),
    agent_id: agentId,
    message,
    tool_name: typeof payload.tool === "string" ? payload.tool : undefined,
    latency_ms:
      typeof (payload.telemetry as Record<string, unknown> | undefined)?.duration_ms === "number"
        ? Number((payload.telemetry as Record<string, unknown>).duration_ms)
        : undefined,
    payload,
  };
}
