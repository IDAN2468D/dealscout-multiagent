import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DealResultCard } from "@/components/search/DealResultCard";
import type { DealCandidate } from "@/types/api";

const baseDeal: DealCandidate = {
  deal_id: "prod_sony_xm5-Amazon",
  product_id: "prod_sony_xm5",
  sku: "SONY-WH1000XM5",
  store_name: "Amazon",
  product_title: "Sony WH-1000XM5 Wireless Headphones",
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
    applied_coupons: [
      {
        code: "HTZ12",
        discount_description: "12% הנחת מועדון הייטקזון",
        verified: true,
        success_rate: 95,
        club_required: "HitechZone",
      },
    ],
    shipping_usd: 15,
    vat_applied: true,
    vat_amount_usd: 45.15,
    total_landed_usd: 295.99,
    total_landed_ils: 1080.36,
    fx_rate_ils: 3.65,
  },
};

describe("DealResultCard", () => {
  it("renders total_landed_ils in LTR span, 18% VAT badge, and expandable breakdown", async () => {
    const user = userEvent.setup();
    render(<DealResultCard deal={baseDeal} rank={1} />);

    const priceEl = screen.getByText("₪1,080.36");
    expect(priceEl).toBeInTheDocument();
    expect(priceEl).toHaveAttribute("dir", "ltr");

    expect(screen.getByText(/מע״מ יבוא 18%/)).toBeInTheDocument();
    expect(screen.getByText("HTZ12")).toHaveAttribute("dir", "ltr");

    await user.click(screen.getByRole("button", { name: /פירוט עלות סופית/ }));
    expect(screen.getByText("מחיר בסיס")).toBeInTheDocument();
    expect(screen.getByText("$268.00")).toBeInTheDocument();
  });

  it("renders VAT-exempt badge when under $75 and shows FAKE_DISCOUNT + 110V warnings", () => {
    const warnedDeal: DealCandidate = {
      ...baseDeal,
      deal_id: "warned-1",
      fake_discount_flag: true,
      discount_verdict: "INCOMPATIBLE_SPEC",
      compatibility_warnings: ["מתח 110V — נדרש שנאי בישראל"],
      cost_breakdown: {
        ...baseDeal.cost_breakdown,
        base_price_usd: 69.9,
        coupon_discount_usd: 0,
        applied_coupons: [],
        shipping_usd: 0,
        vat_applied: false,
        vat_amount_usd: 0,
        total_landed_usd: 69.9,
        total_landed_ils: 255.14,
      },
    };

    render(<DealResultCard deal={warnedDeal} />);

    expect(screen.getByText(/פטור ממע״מ/)).toBeInTheDocument();
    expect(screen.getByText(/FAKE_DISCOUNT/)).toBeInTheDocument();
    expect(screen.getByText(/מתח 110V/)).toBeInTheDocument();
    expect(vi.isMockFunction(vi.fn())).toBe(true);
  });
});
