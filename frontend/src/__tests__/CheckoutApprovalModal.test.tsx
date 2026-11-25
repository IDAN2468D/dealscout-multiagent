import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutApprovalModal } from "@/components/hitl/CheckoutApprovalModal";
import { useSearchStore } from "@/store/searchStore";
import type { DealCandidate } from "@/types/api";

const sampleDeal: DealCandidate = {
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

describe("CheckoutApprovalModal", () => {
  beforeEach(() => {
    useSearchStore.setState({
      pendingApproval: {
        approval_id: "appr-test-123",
        deal: sampleDeal,
        expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
        reason: "אישור אנושי מפורש לפני רכישה",
        status: "PENDING_APPROVAL",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useSearchStore.setState({ pendingApproval: null });
  });

  it("displays seller trust score, countdown, and sends APPROVED decision", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          approval_id: "appr-test-123",
          user_id: "u1",
          status: "APPROVED",
          product_title: sampleDeal.product_title,
          store_name: sampleDeal.store_name,
          total_landed_ils: 1080.36,
          affiliate_url: sampleDeal.affiliate_url,
          message: "האישור התקבל",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const user = userEvent.setup();
    render(<CheckoutApprovalModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("98/100")).toBeInTheDocument();
    expect(screen.getByText(/\d{2}:\d{2}/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/הערה אופציונלית/), "Ship fast");
    await user.click(screen.getByRole("button", { name: /אישור ביצוע/ }));

    await waitFor(() => {
      expect(screen.getByText(/הרכישה אושרה בהצלחה/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/deals/approve-checkout",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends REJECTED decision and closes modal", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          approval_id: "appr-test-123",
          user_id: "u1",
          status: "REJECTED",
          product_title: sampleDeal.product_title,
          store_name: sampleDeal.store_name,
          total_landed_ils: 1080.36,
          affiliate_url: sampleDeal.affiliate_url,
          message: "בוטל",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const user = userEvent.setup();
    render(<CheckoutApprovalModal />);

    await user.click(screen.getByRole("button", { name: /ביטול \(REJECTED\)/ }));

    await waitFor(() => {
      expect(useSearchStore.getState().pendingApproval).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
