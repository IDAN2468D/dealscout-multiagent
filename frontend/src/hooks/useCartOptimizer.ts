"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import type { CartSplitRequest, CartSplitResponse } from "@/types/api";

export function useCartOptimizer() {
  const queryClient = useQueryClient();

  return useMutation<CartSplitResponse, Error, CartSplitRequest>({
    mutationFn: (payload) =>
      apiFetch<CartSplitResponse>("/api/v1/cart/optimize-split", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      if (data.saved_ils > 0) {
        queryClient.invalidateQueries({ queryKey: ["savings"] });
      }
    },
  });
}
