"use client";

import { useCallback, useEffect, useRef } from "react";
import { apiFetchRaw } from "@/lib/apiClient";
import { generateMockDealStream } from "@/lib/mockStream";
import { normalizeDealCandidate, normalizeSSEFrame } from "@/lib/normalizers";
import { createSSEParser, type RawSSEFrame } from "@/lib/sseParser";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";
import type {
  DealCandidate,
  DealSearchRequest,
  PendingCheckoutApproval,
  SearchTelemetrySummary,
} from "@/types/api";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface MultimodalMatchParams {
  file?: File | null;
  product_url?: string;
  hint_text?: string;
}

interface MatchFromImageApiResponse {
  detected_brand: string;
  detected_model: string;
  detected_sku: string;
  confidence: number;
  extraction_method: string;
  matched_deals?: Array<Record<string, unknown>>;
}

type LastSearchAction =
  | { kind: "text"; req: DealSearchRequest }
  | { kind: "multimodal"; params: MultimodalMatchParams };

function isMockFallbackEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_MOCK_FALLBACK === "true";
}

function validateImageFile(file: File): string | null {
  const nameLower = file.name.toLowerCase();
  const hasAllowedExt =
    nameLower.endsWith(".jpg") ||
    nameLower.endsWith(".jpeg") ||
    nameLower.endsWith(".png") ||
    nameLower.endsWith(".webp");

  if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "פורמט תמונה לא נתמך. יש להעלות JPG, PNG או WebP בלבד.";
  }
  if (!file.type && !hasAllowedExt) {
    return "פורמט תמונה לא נתמך. יש להעלות JPG, PNG או WebP בלבד.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "גודל התמונה חורג מ-5MB. יש לבחור קובץ קטן יותר.";
  }
  return null;
}

async function extractErrorMessage(res: Response): Promise<string> {
  if (res.status === 401) {
    return "יש להתחבר לחשבון כדי להריץ חיפוש חי.";
  }
  if (res.status === 403) {
    return "תכונה זו זמינה למסלול PRO בלבד. ניתן לשדרג בפרופיל המשתמש.";
  }
  if (res.status === 429) {
    return "הגעת למכסת החיפושים היומית שלך. נסה שוב מאוחר יותר או שדרג ל-PRO.";
  }
  try {
    const body = (await res.json()) as { detail?: unknown; message?: string };
    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail;
    }
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      return body.detail
        .map((item) => (item as { msg?: string }).msg || JSON.stringify(item))
        .join(" | ");
    }
    if (body.message) {
      return body.message;
    }
  } catch {
    /* ignore non-JSON body */
  }
  return `שגיאת שרת (${res.status})`;
}

export function useDealStream() {
  const abortRef = useRef<AbortController | null>(null);
  const lastSearchRef = useRef<LastSearchAction | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleRawFrame = useCallback((frame: RawSSEFrame): boolean => {
    const store = useSearchStore.getState();
    const evt = normalizeSSEFrame(frame.event, frame.data);
    store.appendEvent(evt);

    if (frame.event === "deal_ranked") {
      const candidate = normalizeDealCandidate(frame.data);
      store.upsertDeal(candidate);
      return false;
    }

    if (frame.event === "approval_required" && frame.data.deal) {
      const deal = normalizeDealCandidate(frame.data.deal as Record<string, unknown>);
      const approval: PendingCheckoutApproval = {
        approval_id: String(frame.data.approval_id || `hitl-${Date.now()}`),
        deal,
        expires_at: String(
          frame.data.expires_at || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        ),
        reason: String(
          frame.data.reason || evt.message || "נדרש אישור משתמש לפני מעבר לתשלום",
        ),
        status: "PENDING_APPROVAL",
      };
      store.setPendingApproval(approval);
      return false;
    }

    if (frame.event === "final_report") {
      const rawDeals = Array.isArray(frame.data.deals) ? frame.data.deals : [];
      const deals: DealCandidate[] = rawDeals.map((d) =>
        normalizeDealCandidate(d as Record<string, unknown>),
      );
      const blockedDeals = Array.isArray(frame.data.blocked_deals)
        ? (frame.data.blocked_deals as Array<Record<string, unknown>>)
        : [];
      const telemetry =
        frame.data.telemetry && typeof frame.data.telemetry === "object"
          ? (frame.data.telemetry as SearchTelemetrySummary)
          : null;
      const summary = String(frame.data.summary || evt.message || "החיפוש הושלם בהצלחה.");

      store.setFinalReport({
        summary,
        deals,
        blockedDeals,
        telemetry,
      });
      useAuthStore.getState().incrementSearchesUsed();
      return true;
    }

    if (frame.event === "error") {
      const msg = String(
        frame.data.message || frame.data.detail || evt.message || "אירעה שגיאה בחיפוש.",
      );
      store.setError(msg);
      return true;
    }

    return false;
  }, []);

  const runMockStream = useCallback(
    async (query: string, signal: AbortSignal) => {
      let finalized = false;
      for await (const frame of generateMockDealStream(query)) {
        if (signal.aborted) return;
        const done = handleRawFrame(frame);
        if (done) finalized = true;
      }
      if (!signal.aborted && !finalized) {
        useSearchStore.getState().stopStream();
      }
    },
    [handleRawFrame],
  );

  const cancelSearch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    useSearchStore.getState().stopStream();
  }, []);

  const startTextSearch = useCallback(
    async (req: DealSearchRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastSearchRef.current = { kind: "text", req };

      const store = useSearchStore.getState();
      store.startStream(req.query);

      try {
        const res = await apiFetchRaw("/api/v1/deals/search", {
          method: "POST",
          body: JSON.stringify(req),
          signal: controller.signal,
        });

        if (!res.ok) {
          const canFallback =
            isMockFallbackEnabled() &&
            (res.status >= 500 ||
              (res.status === 401 && !useAuthStore.getState().accessToken));
          if (canFallback) {
            await runMockStream(req.query, controller.signal);
            return;
          }
          const errMsg = await extractErrorMessage(res);
          store.appendEvent({
            id: `err-${Date.now()}`,
            type: "error",
            timestamp: new Date().toISOString(),
            agent_id: "deal-orchestrator-agent",
            message: errMsg,
          });
          store.setError(errMsg);
          return;
        }

        if (!res.body) {
          throw new Error("Stream body is unavailable.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let sawTerminalEvent = false;

        const parser = createSSEParser((frame) => {
          const isTerminal = handleRawFrame(frame);
          if (isTerminal) sawTerminalEvent = true;
        });

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) {
            await reader.cancel();
            return;
          }
          parser.feed(decoder.decode(value, { stream: true }));
        }

        parser.feed(decoder.decode());
        parser.end();

        if (!controller.signal.aborted && !sawTerminalEvent) {
          useSearchStore.getState().stopStream();
        }
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          return;
        }
        if (isMockFallbackEnabled()) {
          await runMockStream(req.query, controller.signal);
          return;
        }
        const message =
          err instanceof Error && err.message
            ? err.message
            : "חיבור זרם הסוכנים נקטע. ניתן לנסות שוב.";
        useSearchStore.getState().appendEvent({
          id: `err-${Date.now()}`,
          type: "error",
          timestamp: new Date().toISOString(),
          agent_id: "deal-orchestrator-agent",
          message,
        });
        useSearchStore.getState().setError(message);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [handleRawFrame, runMockStream],
  );

  const startMultimodalMatch = useCallback(
    async ({ file, product_url, hint_text }: MultimodalMatchParams) => {
      const store = useSearchStore.getState();

      if (file) {
        const validationError = validateImageFile(file);
        if (validationError) {
          store.setError(validationError);
          return;
        }
      }

      const trimmedUrl = product_url?.trim() || "";
      const trimmedHint = hint_text?.trim() || "";
      if (!file && !trimmedUrl && !trimmedHint) {
        store.setError("יש להעלות תמונה או להזין קישור מוצר לזיהוי.");
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastSearchRef.current = {
        kind: "multimodal",
        params: { file, product_url: trimmedUrl, hint_text: trimmedHint },
      };

      const labelQuery = trimmedHint || trimmedUrl || file?.name || "זיהוי מוצר מולטי-מודאלי";
      store.startStream(labelQuery);
      store.appendEvent({
        id: `mm-start-${Date.now()}`,
        type: "agent_step",
        timestamp: new Date().toISOString(),
        agent_id: "multimodal-product-matcher",
        message: file
          ? `מנתח תמונת מוצר (${file.name}) באמצעות Gemini Vision...`
          : `שולף מפרט ומזהה מק״ט מהקישור (${trimmedUrl})...`,
      });

      try {
        let body: FormData | string;
        if (file) {
          const formData = new FormData();
          formData.append("file", file);
          if (trimmedUrl) formData.append("product_url", trimmedUrl);
          if (trimmedHint) formData.append("hint_text", trimmedHint);
          body = formData;
        } else {
          body = JSON.stringify({
            product_url: trimmedUrl || undefined,
            hint_text: trimmedHint || undefined,
          });
        }

        const res = await apiFetchRaw("/api/v1/deals/match-from-image", {
          method: "POST",
          body,
          signal: controller.signal,
        });

        if (!res.ok) {
          const canFallback =
            isMockFallbackEnabled() &&
            (res.status >= 500 ||
              (res.status === 401 && !useAuthStore.getState().accessToken));
          if (canFallback) {
            await runMockStream(labelQuery, controller.signal);
            return;
          }
          const errMsg = await extractErrorMessage(res);
          useSearchStore.getState().appendEvent({
            id: `mm-err-${Date.now()}`,
            type: "error",
            timestamp: new Date().toISOString(),
            agent_id: "multimodal-product-matcher",
            message: errMsg,
          });
          useSearchStore.getState().setError(errMsg);
          return;
        }

        const data = (await res.json()) as MatchFromImageApiResponse;
        const deals = Array.isArray(data.matched_deals)
          ? data.matched_deals.map((d) => normalizeDealCandidate(d))
          : [];
        const confidencePct = Math.round((data.confidence || 0.85) * 100);

        useSearchStore.getState().appendEvent({
          id: `mm-done-${Date.now()}`,
          type: "tool_call",
          timestamp: new Date().toISOString(),
          agent_id: "multimodal-product-matcher",
          tool_name: data.extraction_method || "gemini_vision",
          message: `זוהה דגם ${data.detected_brand} ${data.detected_model} (מק״ט ${data.detected_sku}, ביטחון ${confidencePct}%)`,
        });

        const summary = `זיהוי מולטי-מודאלי: ${data.detected_brand} ${data.detected_model} (SKU: ${data.detected_sku}) — נמצאו ${deals.length} הצעות מדורגות.`;
        useSearchStore.getState().setFinalReport({
          summary,
          deals,
        });
        useAuthStore.getState().incrementSearchesUsed();
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          return;
        }
        if (isMockFallbackEnabled()) {
          await runMockStream(labelQuery, controller.signal);
          return;
        }
        const message =
          err instanceof Error && err.message
            ? err.message
            : "זיהוי המוצר נכשל. נסה שוב.";
        useSearchStore.getState().setError(message);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [runMockStream],
  );

  const retryLastSearch = useCallback(() => {
    const last = lastSearchRef.current;
    if (!last) return;
    if (last.kind === "text") {
      void startTextSearch(last.req);
    } else {
      void startMultimodalMatch(last.params);
    }
  }, [startMultimodalMatch, startTextSearch]);

  return {
    startTextSearch,
    startMultimodalMatch,
    cancelSearch,
    retryLastSearch,
  };
}
