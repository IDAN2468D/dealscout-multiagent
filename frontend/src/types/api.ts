export type UserRole = "FREE" | "PRO" | "ADMIN";

export type DiscountVerdict =
  | "GREAT_DEAL"
  | "FAIR_PRICE"
  | "FAKE_DISCOUNT"
  | "INCOMPATIBLE_SPEC"
  | "BLOCKED_SCAM";

export type NotificationChannel = "email" | "telegram" | "slack";

export interface UserProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  tier: UserRole;
  is_verified: boolean;
  daily_searches_used: number;
  daily_searches_limit: number;
  preferred_currency: "ILS" | "USD" | "EUR";
  ship_to_country: string;
  credit_card_clubs: string[];
  preferred_stores: string[];
  min_seller_trust: number;
  notification_channels: NotificationChannel[];
  telegram_chat_id?: string | null;
  long_term_preferences?: {
    official_warranty_only?: boolean;
    max_delivery_days?: number;
    [key: string]: unknown;
  };
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
  success_rate: number; // 0..100
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
  product_id: string;
  sku: string;
  store_name: string;
  product_title: string;
  product_url: string;
  affiliate_url: string;
  image_url?: string;
  seller_name: string;
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

export type AgentId =
  | "deal-orchestrator-agent"
  | "multimodal-product-matcher"
  | "store-search-mcp-agent"
  | "coupon-hunter-rag-agent"
  | "price-history-auditor"
  | "review-compatibility-auditor"
  | "landed-cost-calculator"
  | "smart-cart-tax-optimizer"
  | "trust-guardrails-hitl-agent";

export interface AgentStreamEvent {
  id: string;
  type: SSEEventType;
  timestamp: string;
  agent_id: AgentId;
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

export interface CartPackageSummary {
  package_index: number;
  items: string[];
  items_subtotal_usd: number;
  shipping_usd: number;
  vat_applied: boolean;
  vat_amount_usd: number;
  package_total_usd: number;
  package_total_ils: number;
}

export interface CartSplitResponse {
  store_name: string;
  ship_to_country: string;
  recommended_strategy: "SPLIT_PACKAGES" | "SINGLE_SHIPMENT";
  baseline_combined_usd: number;
  baseline_combined_ils: number;
  baseline_vat_usd: number;
  optimized_total_usd: number;
  optimized_total_ils: number;
  saved_usd: number;
  saved_ils: number;
  packages: CartPackageSummary[];
  explanation: string;
}

export interface PendingCheckoutApproval {
  approval_id: string;
  deal: DealCandidate;
  expires_at: string;
  reason: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  user_note?: string | null;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  product_id: string;
  sku: string;
  product_title: string;
  store_name?: string | null;
  target_price_ils?: number | null;
  target_price_usd?: number | null;
  last_seen_price_usd?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface KafkaPriceAlert {
  id: string;
  product_id: string;
  store_name: string;
  new_price_usd: number;
  new_price_ils: number;
  channels: string[];
  created_at: string;
}

export interface PriceHistoryPoint {
  store_name: string;
  price_usd: number;
  original_listed_usd?: number | null;
  recorded_at: string;
}

export interface PriceHistoryResponse {
  product_id: string;
  sku: string;
  avg_90d_usd: number;
  historical_low_usd: number;
  max_30d_pre_sale_usd: number;
  current_price_usd: number;
  fake_discount_flag: boolean;
  spike_pct: number;
  points: PriceHistoryPoint[];
}

export interface SavingsEntry {
  id: string;
  source_type: string;
  saved_ils: number;
  saved_usd: number;
  description?: string | null;
  reference_sku?: string | null;
  created_at: string;
}

export interface SavingsSummaryResponse {
  user_id: string;
  total_saved_ils: number;
  total_saved_usd: number;
  breakdown_by_source: Record<string, number>;
  recent_entries: SavingsEntry[];
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  model_id: string;
  best_landed_ils?: number | null;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  llm_cost_usd: number;
  duration_ms: number;
  created_at: string;
}

export interface SearchTelemetrySummary {
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  llm_cost_usd: number;
  duration_ms: number;
}

export interface AdminTelemetryResponse {
  service_name: string;
  default_model: string;
  total_searches_recorded: number;
  total_otel_spans: number;
  total_langfuse_events: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  total_llm_cost_usd: number;
  avg_duration_ms: number;
  recent_searches: Array<{
    id: string;
    user_id: string;
    query: string;
    model_id: string;
    best_landed_ils?: number | null;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    llm_cost_usd: number;
    duration_ms: number;
    created_at: string;
  }>;
  context_cache: {
    mode: string;
    model: string;
    ttl_seconds: number;
    cache_name?: string;
    policy_count?: number;
  };
  db_totals: {
    total_searches: number;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    llm_cost_usd: number;
  };
}

export interface AdminModerationResponse {
  coupons: Array<{
    code: string;
    store_name: string;
    success_rate: number;
    total_votes: number;
    suppressed: boolean;
    required_club?: string | null;
  }>;
  blocked_sellers: Array<{
    id: string;
    product_id?: string | null;
    store_name: string;
    seller_name: string;
    seller_trust_score: number;
    threats: string[];
    reason: string;
    created_at: string;
  }>;
}
