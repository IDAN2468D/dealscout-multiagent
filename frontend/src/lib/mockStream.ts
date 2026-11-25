import type { RawSSEFrame } from "@/lib/sseParser";

export async function* generateMockDealStream(query: string): AsyncGenerator<RawSSEFrame> {
  yield {
    event: "agent_step",
    data: {
      agent: "deal-orchestrator-agent",
      status: "started",
      query,
      model: "gemini-3.5-flash-lite",
    },
  };
  await new Promise((r) => setTimeout(r, 150));

  yield {
    event: "tool_call",
    data: {
      agent: "store-search-mcp-agent",
      tool: "search_store_offers",
      offers_found: 2,
    },
  };
  await new Promise((r) => setTimeout(r, 150));

  const mockDeal = {
    product_id: "prod_sony_xm5",
    sku: "SONY-WH1000XM5",
    store_name: "Amazon",
    product_title: `Sony WH-1000XM5 (${query})`,
    product_url: "https://www.amazon.com/dp/B09XS7JWHH",
    affiliate_url: "https://www.amazon.com/dp/B09XS7JWHH?tag=dealscoutai-20",
    seller_name: "Amazon.com Services",
    seller_trust_score: 98,
    in_stock: true,
    fake_discount_flag: false,
    compatibility_warnings: [],
    discount_verdict: "GREAT_DEAL",
    historical_low_usd: 259,
    avg_90d_usd: 329,
    cost_breakdown: {
      base_price_usd: 268,
      coupon_discount_usd: 32.16,
      applied_coupons: ["HTZ12"],
      shipping_usd: 15,
      vat_applied: true,
      vat_amount_usd: 45.15,
      total_landed_usd: 295.99,
      total_landed_ils: 1080.36,
    },
  };

  yield {
    event: "deal_ranked",
    data: { rank: 1, ...mockDeal },
  };
  yield {
    event: "final_report",
    data: {
      query,
      summary: "מצב הדגמה אופליין: נמצאה הצעה מאומתת באמזון עם הנחת הייטקזון.",
      deals_count: 1,
      blocked_count: 0,
      warnings_count: 0,
      best_landed_ils: 1080.36,
      deals: [mockDeal],
      telemetry: {
        model_id: "gemini-3.5-flash-lite",
        input_tokens: 320,
        output_tokens: 95,
        cached_tokens: 650,
        llm_cost_usd: 0.000065,
        duration_ms: 310,
      },
    },
  };
}
