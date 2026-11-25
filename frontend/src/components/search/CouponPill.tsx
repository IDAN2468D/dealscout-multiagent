"use client";

import { useState } from "react";
import { Check, CheckCircle2, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { cn } from "@/lib/formatters";
import { useSearchStore } from "@/store/searchStore";
import type { CouponInfo } from "@/types/api";

interface CouponFeedbackApiResponse {
  coupon_code: string;
  store_name: string;
  worked: boolean;
  success_rate: number;
  total_votes: number;
  suppressed: boolean;
}

interface CouponPillProps {
  coupon: CouponInfo;
  dealId: string;
  storeName: string;
  cartTotalUsd?: number;
}

export function CouponPill({
  coupon,
  dealId,
  storeName,
  cartTotalUsd,
}: CouponPillProps) {
  const updateDealCouponFeedback = useSearchStore(
    (s) => s.updateDealCouponFeedback,
  );
  const [copied, setCopied] = useState(false);
  const [voted, setVoted] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard permission denied */
    }
  };

  const handleVote = async (worked: boolean) => {
    if (isSubmitting) return;
    setFeedbackError(null);
    const prevRate = coupon.success_rate;
    const optimisticRate = worked
      ? Math.min(100, Math.round(prevRate + 2))
      : Math.max(0, Math.round(prevRate - 5));

    setVoted(worked);
    updateDealCouponFeedback(dealId, coupon.code, optimisticRate);
    setIsSubmitting(true);

    try {
      const res = await apiFetch<CouponFeedbackApiResponse>(
        `/api/v1/coupons/${encodeURIComponent(coupon.code)}/feedback`,
        {
          method: "POST",
          body: JSON.stringify({
            store_name: storeName,
            worked,
            cart_total_usd: cartTotalUsd,
          }),
        },
      );
      const normalizedRate =
        res.success_rate <= 1
          ? Math.round(res.success_rate * 100)
          : Math.round(res.success_rate);
      updateDealCouponFeedback(dealId, coupon.code, normalizedRate);
    } catch {
      updateDealCouponFeedback(dealId, coupon.code, prevRate);
      setVoted(null);
      setFeedbackError("נדרשת התחברות לשליחת דירוג קופון");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            dir="ltr"
            className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-emerald-800 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-300"
          >
            {coupon.code}
          </span>

          <button
            type="button"
            onClick={handleCopy}
            title="העתק קוד קופון"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                <span>הועתק</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>העתק</span>
              </>
            )}
          </button>

          {coupon.verified && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>מאומת</span>
            </span>
          )}

          {coupon.club_required && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
              מועדון {coupon.club_required}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
            הצלחה בקהילה:{" "}
            <span dir="ltr" className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {Math.round(coupon.success_rate)}%
            </span>
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleVote(true)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition",
                voted === true
                  ? "border-emerald-500 bg-emerald-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
              )}
            >
              <ThumbsUp className="h-3 w-3" />
              <span>עבד 👍</span>
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleVote(false)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition",
                voted === false
                  ? "border-rose-500 bg-rose-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-rose-400 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
              )}
            >
              <ThumbsDown className="h-3 w-3" />
              <span>לא עבד 👎</span>
            </button>
          </div>
        </div>
      </div>

      {coupon.discount_description && (
        <p className="text-[11px] text-slate-600 dark:text-slate-300">
          {coupon.discount_description}
        </p>
      )}
      {feedbackError && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">{feedbackError}</p>
      )}
    </div>
  );
}
