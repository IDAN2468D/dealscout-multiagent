"use client";

import { create } from "zustand";
import type {
  AgentStreamEvent,
  DealCandidate,
  PendingCheckoutApproval,
  SearchTelemetrySummary,
} from "@/types/api";

interface SearchState {
  query: string;
  events: AgentStreamEvent[];
  deals: DealCandidate[];
  blockedDeals: Array<Record<string, unknown>>;
  summary: string | null;
  telemetry: SearchTelemetrySummary | null;
  isStreaming: boolean;
  error: string | null;
  selectedHistoryProductId: string | null;
  pendingApproval: PendingCheckoutApproval | null;

  setQuery: (query: string) => void;
  startStream: (query: string) => void;
  appendEvent: (event: AgentStreamEvent) => void;
  upsertDeal: (deal: DealCandidate) => void;
  setFinalReport: (payload: {
    summary: string;
    deals: DealCandidate[];
    blockedDeals?: Array<Record<string, unknown>>;
    telemetry?: SearchTelemetrySummary | null;
  }) => void;
  setError: (error: string | null) => void;
  stopStream: () => void;
  openHistoryDrawer: (productId: string) => void;
  closeHistoryDrawer: () => void;
  setPendingApproval: (approval: PendingCheckoutApproval | null) => void;
  updateDealCouponFeedback: (
    dealId: string,
    couponCode: string,
    newRatePct: number,
  ) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: "",
  events: [],
  deals: [],
  blockedDeals: [],
  summary: null,
  telemetry: null,
  isStreaming: false,
  error: null,
  selectedHistoryProductId: null,
  pendingApproval: null,

  setQuery: (query) => set({ query }),
  startStream: (query) =>
    set({
      query,
      events: [],
      deals: [],
      blockedDeals: [],
      summary: null,
      telemetry: null,
      isStreaming: true,
      error: null,
    }),
  appendEvent: (event) =>
    set((state) => ({
      events: [...state.events, event],
    })),
  upsertDeal: (deal) =>
    set((state) => {
      const exists = state.deals.some((d) => d.deal_id === deal.deal_id);
      const next = exists
        ? state.deals.map((d) => (d.deal_id === deal.deal_id ? deal : d))
        : [...state.deals, deal];
      next.sort(
        (a, b) => a.cost_breakdown.total_landed_ils - b.cost_breakdown.total_landed_ils,
      );
      return { deals: next };
    }),
  setFinalReport: ({ summary, deals, blockedDeals = [], telemetry = null }) =>
    set({
      summary,
      deals,
      blockedDeals,
      telemetry,
      isStreaming: false,
    }),
  setError: (error) => set({ error, isStreaming: false }),
  stopStream: () => set({ isStreaming: false }),
  openHistoryDrawer: (productId) => set({ selectedHistoryProductId: productId }),
  closeHistoryDrawer: () => set({ selectedHistoryProductId: null }),
  setPendingApproval: (pendingApproval) => set({ pendingApproval }),
  updateDealCouponFeedback: (dealId, couponCode, newRatePct) =>
    set((state) => ({
      deals: state.deals.map((d) =>
        d.deal_id !== dealId
          ? d
          : {
              ...d,
              cost_breakdown: {
                ...d.cost_breakdown,
                applied_coupons: d.cost_breakdown.applied_coupons.map((c) =>
                  c.code === couponCode ? { ...c, success_rate: newRatePct } : c,
                ),
              },
            },
      ),
    })),
}));
