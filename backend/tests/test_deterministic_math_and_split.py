"""Sprint 2 tests: Deterministic Landed Cost, Israel 18% VAT ($75 rule), Cart Split, Price History & Affiliate."""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.app.api.schemas import CartItemInput, CartSplitRequest
from backend.app.search.elasticsearch_catalog import fuzzy_search_catalog
from backend.app.tools.affiliate_tools import inject_affiliate_params
from backend.app.tools.cart_split_optimizer_tools import optimize_cart_tax_split
from backend.app.tools.landed_cost_tools import calculate_landed_cost_il
from backend.app.tools.price_history_tools import audit_fake_discount, get_price_history_90d


def test_israel_vat_threshold_exact_boundary() -> None:
    """Net <= $75.00 is VAT-exempt (0%); Net > $75.00 applies 18% VAT on (net + shipping)."""
    # Exactly $75.00 net -> VAT exempt
    below = calculate_landed_cost_il(
        base_price_usd=85.00,
        shipping_usd=10.00,
        coupon_discount_usd=10.00,
        applied_coupons=["WELCOME10"],
        ship_to_country="IL",
        fx_rate_ils=3.65,
    )
    assert below.vat_applied is False
    assert below.vat_amount_usd == 0.0
    assert below.total_landed_usd == 85.00
    assert below.total_landed_ils == round(85.00 * 3.65, 2)

    # $75.01 net -> 18% VAT on (75.01 + 10.00) = 85.01 * 0.18 = 15.30
    above = calculate_landed_cost_il(
        base_price_usd=75.01,
        shipping_usd=10.00,
        coupon_discount_usd=0.0,
        applied_coupons=[],
        ship_to_country="IL",
        fx_rate_ils=3.65,
    )
    assert above.vat_applied is True
    assert above.vat_amount_usd == round(85.01 * 0.18, 2)
    assert above.total_landed_usd == round(85.01 + above.vat_amount_usd, 2)
    assert above.total_landed_ils == round(above.total_landed_usd * 3.65, 2)


def test_cart_split_optimizer_saves_vat_on_multi_item_cart() -> None:
    """Splitting $58 + $64 items into two <=$75 packages beats single combined VAT shipment."""
    req = CartSplitRequest(
        store_name="ASOS",
        items=[
            CartItemInput(
                sku="NIKE-PEG41",
                title="Nike Pegasus 41",
                store_name="ASOS",
                unit_price_usd=58.0,
                quantity=1,
            ),
            CartItemInput(
                sku="ADIDAS-UB5",
                title="Adidas Ultraboost 5",
                store_name="ASOS",
                unit_price_usd=64.0,
                quantity=1,
            ),
        ],
        shipping_per_package_usd=8.0,
        free_shipping_threshold_usd=49.0,
        ship_to_country="IL",
    )
    res = optimize_cart_tax_split(req, fx_rate_ils=3.65)
    assert res.recommended_strategy == "SPLIT_PACKAGES"
    assert len(res.packages) == 2
    assert all(not p.vat_applied for p in res.packages)
    assert res.saved_usd > 0
    assert res.saved_ils > 0
    assert res.optimized_total_usd == 122.00
    assert res.baseline_combined_usd == round(122.00 * 1.18, 2)


def test_fuzzy_search_fake_discount_and_affiliate_injection(db_session: Session) -> None:
    """Verify fuzzy catalog matching, >15% fake discount detection, and affiliate URL sanitization."""
    matches = fuzzy_search_catalog("sony xm5")
    assert matches and matches[0]["sku"] == "SONY-WH1000XM5"

    # Samsung T7 Shield 2TB on eBay spiked >15% before current sale
    hist = get_price_history_90d(db_session, product_id="SAM-T7-2TB", store_name="eBay")
    assert hist.fake_discount_flag is True
    assert hist.spike_pct > 15.0

    audit_t7 = audit_fake_discount(
        db_session, product_id="SAM-T7-2TB", store_name="eBay", current_price_usd=131.0
    )
    assert audit_t7["fake_discount_flag"] is True

    # Sony WH-1000XM5 on Amazon has clean genuine pricing
    audit_sony = audit_fake_discount(
        db_session, product_id="SONY-WH1000XM5", store_name="Amazon", current_price_usd=268.0
    )
    assert audit_sony["fake_discount_flag"] is False

    # Affiliate parameter injection strips untrusted tag and injects dealscoutai-20
    aff_url = inject_affiliate_params(
        "https://www.amazon.com/dp/B09XS7JWHH?tag=evil-20&ref=abc",
        "Amazon",
    )
    assert "tag=dealscoutai-20" in aff_url
    assert "evil-20" not in aff_url
