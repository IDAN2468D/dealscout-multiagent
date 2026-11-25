"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import type { KafkaPriceAlert, WatchlistItem } from "@/types/api";

export interface AddWatchlistPayload {
  product_id: string;
  sku: string;
  product_title: string;
  store_name?: string | null;
  target_price_ils?: number | null;
  target_price_usd?: number | null;
}

export interface TriggerPriceDropPayload {
  product_id: string;
  sku: string;
  store_name: string;
  new_price_usd: number;
}

export interface TriggerPriceDropResponse {
  event: string;
  product_id: string;
  sku: string;
  store_name: string;
  new_price_usd: number;
  total_alerts_dispatched: number;
  user_alerts: Array<Record<string, unknown>>;
}

export function useWatchlist() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const enabled = Boolean(user);

  const watchlistQuery = useQuery<WatchlistItem[], Error>({
    queryKey: ["watchlist"],
    queryFn: () => apiFetch<WatchlistItem[]>("/api/v1/watchlist"),
    enabled,
  });

  const alertsQuery = useQuery<KafkaPriceAlert[], Error>({
    queryKey: ["deal-alerts"],
    queryFn: () => apiFetch<KafkaPriceAlert[]>("/api/v1/deals/alerts"),
    enabled,
    refetchInterval: 15_000,
  });

  const addWatchlist = useMutation<
    WatchlistItem,
    Error,
    AddWatchlistPayload,
    { previous?: WatchlistItem[] }
  >({
    mutationFn: (payload) =>
      apiFetch<WatchlistItem>("/api/v1/watchlist", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist"] });
      const previous = queryClient.getQueryData<WatchlistItem[]>(["watchlist"]);

      const optimistic: WatchlistItem = {
        id: `optimistic-${Date.now()}`,
        user_id: user?.user_id || "me",
        product_id: newItem.product_id,
        sku: newItem.sku,
        product_title: newItem.product_title,
        store_name: newItem.store_name ?? null,
        target_price_ils: newItem.target_price_ils ?? null,
        target_price_usd: newItem.target_price_usd ?? null,
        last_seen_price_usd: null,
        is_active: true,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<WatchlistItem[]>(["watchlist"], (old) => [
        optimistic,
        ...(old ?? []),
      ]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["watchlist"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const removeWatchlist = useMutation<
    { deleted: boolean; id: string },
    Error,
    string,
    { previous?: WatchlistItem[] }
  >({
    mutationFn: (id) =>
      apiFetch<{ deleted: boolean; id: string }>(`/api/v1/watchlist/${id}`, {
        method: "DELETE",
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist"] });
      const previous = queryClient.getQueryData<WatchlistItem[]>(["watchlist"]);

      queryClient.setQueryData<WatchlistItem[]>(["watchlist"], (old) =>
        (old ?? []).filter((item) => item.id !== id),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["watchlist"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const triggerKafkaPriceDrop = useMutation<
    TriggerPriceDropResponse,
    Error,
    TriggerPriceDropPayload
  >({
    mutationFn: (payload) =>
      apiFetch<TriggerPriceDropResponse>("/api/v1/deals/price-drop", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  return {
    items: watchlistQuery.data ?? [],
    isLoading: watchlistQuery.isLoading,
    error: watchlistQuery.error,
    alerts: alertsQuery.data ?? [],
    alertsLoading: alertsQuery.isLoading,
    refetchAlerts: alertsQuery.refetch,
    addWatchlist,
    removeWatchlist,
    triggerKafkaPriceDrop,
  };
}
