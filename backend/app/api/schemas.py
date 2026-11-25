"""Pydantic v2 request, response, and user-context contracts for DealScout AI."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


TierType = Literal["FREE", "PRO", "ADMIN"]
VerdictType = Literal[
    "GREAT_DEAL", "FAIR_PRICE", "FAKE_DISCOUNT", "INCOMPATIBLE_SPEC", "BLOCKED_SCAM"
]


class UserBuyerProfileUpdate(BaseModel):
    preferred_currency: Literal["ILS", "USD", "EUR"] = "ILS"
    ship_to_country: str = Field(default="IL", min_length=2, max_length=2)
    credit_card_clubs: list[str] = Field(default_factory=list)
    preferred_stores: list[str] = Field(default_factory=list)
    min_seller_trust: int = Field(default=75, ge=50, le=100)
    notification_channels: list[Literal["email", "telegram", "slack"]] = Field(
        default_factory=lambda: ["email"]
    )
    telegram_chat_id: Optional[str] = None
    long_term_preferences: Optional[dict[str, Any]] = None


class UserBuyerProfileOut(UserBuyerProfileUpdate):
    user_id: str
    long_term_preferences: dict[str, Any] = Field(default_factory=dict)
    updated_at: Optional[datetime] = None


class UserContext(BaseModel):
    """Verified user identity and buyer preferences injected into agents & MCP tools."""

    model_config = ConfigDict(from_attributes=True)

    user_id: str
    email: str
    full_name: str = ""
    role: TierType = "FREE"
    tier: TierType = "FREE"
    is_verified: bool = True
    buyer_profile: UserBuyerProfileUpdate = Field(default_factory=UserBuyerProfileUpdate)


# ==============================================================================
# Auth Schemas
# ==============================================================================


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=10, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=80)


class UserRegisterResponse(BaseModel):
    user_id: str
    email: str
    full_name: str
    tier: TierType
    is_verified: bool
    verification_token: str
    message: str


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user_id: str
    email: str
    role: TierType
    tier: TierType


class UserMeResponse(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: TierType
    tier: TierType
    is_verified: bool
    daily_searches_used: int = 0
    daily_searches_limit: int = 10
    buyer_profile: UserBuyerProfileOut


# ==============================================================================
# Deal Search, Cost Breakdown & Cart Optimization Schemas (SPEC 7.2)
# ==============================================================================


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


class CartPackageSummary(BaseModel):
    package_index: int
    items: list[str]
    items_subtotal_usd: float
    shipping_usd: float
    vat_applied: bool
    vat_amount_usd: float
    package_total_usd: float
    package_total_ils: float


class CartSplitResponse(BaseModel):
    store_name: str
    ship_to_country: str
    recommended_strategy: Literal["SPLIT_PACKAGES", "SINGLE_SHIPMENT"]
    baseline_combined_usd: float
    baseline_combined_ils: float
    baseline_vat_usd: float
    optimized_total_usd: float
    optimized_total_ils: float
    saved_usd: float
    saved_ils: float
    packages: list[CartPackageSummary]
    explanation: str


class CouponFeedbackRequest(BaseModel):
    store_name: str
    worked: bool
    cart_total_usd: Optional[float] = None


class CouponFeedbackResponse(BaseModel):
    coupon_code: str
    store_name: str
    worked: bool
    success_rate: float
    total_votes: int
    suppressed: bool


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
    product_id: str = ""
    sku: str = ""
    store_name: str
    product_title: str
    product_url: str
    affiliate_url: str
    seller_name: str = "Official Store"
    seller_trust_score: int = Field(ge=0, le=100)
    in_stock: bool
    fake_discount_flag: bool
    compatibility_warnings: list[str] = Field(default_factory=list)
    discount_verdict: VerdictType
    historical_low_usd: float
    avg_90d_usd: float = 0.0
    cost_breakdown: LandedCostBreakdown


class MatchFromImageRequest(BaseModel):
    product_url: Optional[str] = None
    image_base64: Optional[str] = None
    image_mime_type: str = "image/png"
    hint_text: Optional[str] = None


class MatchFromImageResponse(BaseModel):
    detected_brand: str
    detected_model: str
    detected_sku: str
    confidence: float
    extraction_method: str
    matched_deals: list[DealCandidate] = Field(default_factory=list)


# ==============================================================================
# Watchlist, HITL Checkout & Savings Schemas
# ==============================================================================


class WatchlistCreateRequest(BaseModel):
    product_id: str
    sku: str
    product_title: str
    store_name: Optional[str] = None
    target_price_ils: Optional[float] = Field(default=None, gt=0)
    target_price_usd: Optional[float] = Field(default=None, gt=0)


class WatchlistItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    product_id: str
    sku: str
    product_title: str
    store_name: Optional[str]
    target_price_ils: Optional[float]
    target_price_usd: Optional[float]
    last_seen_price_usd: Optional[float]
    is_active: bool
    created_at: datetime


class CheckoutInitiateRequest(BaseModel):
    product_id: str
    sku: str
    product_title: str
    store_name: str
    affiliate_url: str
    total_landed_usd: float = Field(..., gt=0)
    total_landed_ils: float = Field(..., gt=0)
    applied_coupons: list[str] = Field(default_factory=list)


class CheckoutApprovalRequest(BaseModel):
    approval_id: str
    decision: Literal["APPROVED", "REJECTED"]
    user_note: Optional[str] = None


class CheckoutApprovalResponse(BaseModel):
    approval_id: str
    user_id: str
    status: Literal["PENDING_APPROVAL", "APPROVED", "REJECTED"]
    product_title: str
    store_name: str
    total_landed_ils: float
    affiliate_url: str
    user_note: Optional[str] = None
    message: str


class SavingsEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_type: str
    saved_ils: float
    saved_usd: float
    description: Optional[str]
    reference_sku: Optional[str]
    created_at: datetime


class SavingsSummaryResponse(BaseModel):
    user_id: str
    total_saved_ils: float
    total_saved_usd: float
    breakdown_by_source: dict[str, float]
    recent_entries: list[SavingsEntryOut]


class SearchHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    query: str
    model_id: str
    best_landed_ils: Optional[float]
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    llm_cost_usd: float
    duration_ms: float
    created_at: datetime


class PriceHistoryPointOut(BaseModel):
    store_name: str
    price_usd: float
    original_listed_usd: Optional[float]
    recorded_at: datetime


class PriceHistoryResponse(BaseModel):
    product_id: str
    sku: str
    avg_90d_usd: float
    historical_low_usd: float
    max_30d_pre_sale_usd: float
    current_price_usd: float
    fake_discount_flag: bool
    spike_pct: float
    points: list[PriceHistoryPointOut]


class PriceDropTriggerRequest(BaseModel):
    product_id: str
    sku: str
    store_name: str
    new_price_usd: float = Field(..., gt=0)


class AdminTierUpdateRequest(BaseModel):
    tier: TierType


class CouponModerationRequest(BaseModel):
    store_name: str
    action: Literal["suppress", "restore"]
