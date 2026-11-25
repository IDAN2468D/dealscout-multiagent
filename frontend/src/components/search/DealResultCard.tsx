"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookmarkCheck,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  History,
  ShieldCheck,
  ShoppingBag,
  Zap,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import {
  VERDICT_META_HE,
  cn,
  formatILS,
  formatUSD,
} from "@/lib/formatters";
import { useSearchStore } from "@/store/searchStore";
import { CouponPill } from "@/components/search/CouponPill";
import type { DealCandidate } from "@/types/api";

interface CheckoutInitiateResponse {
  approval_id: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  message: string;
}

interface DealResultCardProps {
  deal: DealCandidate;
  rank?: number;
}

const TONE_BADGE_CLASSES = {
  emerald:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  slate:
    "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  rose: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  amber:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
} as const;

export function DealResultCard({ deal, rank }: DealResultCardProps) {
  const openHistoryDrawer = useSearchStore((s) => s.openHistoryDrawer);
  const setPendingApproval = useSearchStore((s) => s.setPendingApproval);

  const [expanded, setExpanded] = useState(false);
  const [watchlistStatus, setWatchlistStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const verdictMeta =
    VERDICT_META_HE[deal.discount_verdict] || VERDICT_META_HE.FAIR_PRICE;
  const cb = deal.cost_breakdown;
  const hasVoltageOrSpecWarning =
    deal.discount_verdict === "INCOMPATIBLE_SPEC" ||
    deal.compatibility_warnings.length > 0;

  const handleAddWatchlist = async () => {
    if (watchlistStatus === "saving" || watchlistStatus === "saved") return;
    setWatchlistStatus("saving");
    setActionMessage(null);
    try {
      await apiFetch("/api/v1/watchlist", {
        method: "POST",
        body: JSON.stringify({
          product_id: deal.product_id || deal.sku,
          sku: deal.sku,
          product_title: deal.product_title,
          store_name: deal.store_name,
          target_price_ils: Math.max(1, Math.round(cb.total_landed_ils * 0.9)),
          target_price_usd: Math.max(1, Number((cb.total_landed_usd * 0.9).toFixed(2))),
        }),
      });
      setWatchlistStatus("saved");
      setActionMessage("המוצר נוסף לרשימת המעקב שלך.");
    } catch (err) {
      setWatchlistStatus("error");
      if (err instanceof ApiError && err.status === 401) {
        setActionMessage("יש להתחבר לחשבון כדי להוסיף מוצר למעקב.");
      } else if (err instanceof ApiError) {
        setActionMessage(err.message);
      } else {
        setActionMessage("שגיאה בהוספה לרשימת המעקב.");
      }
    }
  };

  const handleInitiateCheckout = async () => {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    setActionMessage(null);
    try {
      const res = await apiFetch<CheckoutInitiateResponse>(
        "/api/v1/deals/checkout/initiate",
        {
          method: "POST",
          body: JSON.stringify({
            product_id: deal.product_id || deal.sku,
            sku: deal.sku,
            product_title: deal.product_title,
            store_name: deal.store_name,
            affiliate_url: deal.affiliate_url || deal.product_url,
            total_landed_usd: cb.total_landed_usd,
            total_landed_ils: cb.total_landed_ils,
            applied_coupons: cb.applied_coupons.map((c) => c.code),
          }),
        },
      );
      setPendingApproval({
        approval_id: res.approval_id,
        deal,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        reason: res.message || "אישור אנושי מפורש (HITL) לפני מעבר לרכישה בחנות",
        status: "PENDING_APPROVAL",
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionMessage("יש להתחבר לחשבון כדי לאשר רכישה מאובטחת (HITL).");
      } else if (err instanceof ApiError) {
        setActionMessage(err.message);
      } else {
        setActionMessage("לא ניתן לפתוח בקשת אישור HITL כרגע.");
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <article
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5 dark:bg-slate-900",
        deal.fake_discount_flag
          ? "border-rose-300 dark:border-rose-900/70"
          : hasVoltageOrSpecWarning
            ? "border-amber-300 dark:border-amber-900/70"
            : "border-slate-200 dark:border-slate-800",
      )}
    >
      {/* Top Row: Store, Seller Trust, Semantic Verdict & Total Landed ILS */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {typeof rank === "number" && (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                <span dir="ltr">#{rank}</span>
              </span>
            )}
            <span
              dir="ltr"
              className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100"
            >
              {deal.store_name}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                TONE_BADGE_CLASSES[verdictMeta.tone],
              )}
            >
              {verdictMeta.label}
            </span>
            {!deal.in_stock && (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                אזל מהמלאי
              </span>
            )}
          </div>

          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {deal.product_title}
          </h3>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>מוכר:</span>
              <span dir="ltr" className="font-medium text-slate-700 dark:text-slate-300">
                {deal.seller_name}
              </span>
              <span>· אמינות</span>
              <span
                dir="ltr"
                className="font-bold tabular-nums text-slate-800 dark:text-slate-200"
              >
                {deal.seller_trust_score}/100
              </span>
            </span>

            {deal.sku && (
              <span>
                מק״ט:{" "}
                <span dir="ltr" className="font-mono text-slate-700 dark:text-slate-300">
                  {deal.sku}
                </span>
              </span>
            )}

            {deal.product_url && (
              <a
                href={deal.affiliate_url || deal.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <span dir="ltr" className="max-w-[200px] truncate">
                  {deal.product_url}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            )}
          </div>
        </div>

        {/* Price Callout */}
        <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-end dark:border-slate-800 dark:bg-slate-950">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            מחיר סופי עד הבית
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums dark:text-white">
            <span dir="ltr">{formatILS(cb.total_landed_ils)}</span>
          </div>
          <div className="text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">
            <span dir="ltr">{formatUSD(cb.total_landed_usd)}</span>
          </div>
        </div>
      </div>

      {/* FAKE_DISCOUNT Rose Banner */}
      {deal.fake_discount_flag && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <span className="font-bold">אזהרת הנחה פיקטיבית (FAKE_DISCOUNT): </span>
            <span>
              המחיר הועלה מלאכותית לפני המבצע. ממוצע 90 יום:{" "}
              <span dir="ltr" className="font-bold tabular-nums">
                {formatUSD(deal.avg_90d_usd)}
              </span>{" "}
              · שפל היסטורי:{" "}
              <span dir="ltr" className="font-bold tabular-nums">
                {formatUSD(deal.historical_low_usd)}
              </span>
              .
            </span>
          </div>
        </div>
      )}

      {/* 110V / INCOMPATIBLE_SPEC Amber Banner */}
      {hasVoltageOrSpecWarning && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <span className="font-bold">
              אזהרת תאימות מפרט / מתח חשמל (<span dir="ltr">110V</span>):{" "}
            </span>
            <span>
              {deal.compatibility_warnings.length > 0
                ? deal.compatibility_warnings.join(" · ")
                : "מוצר זה עלול לדרוש שנאי 110V-230V או מתאם שקע לישראל."}
            </span>
          </div>
        </div>
      )}

      {/* VAT Exemption / Charge Pill + Expand Toggle */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {cb.vat_applied ? (
            <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              מע״מ יבוא 18% (<span dir="ltr">{formatUSD(cb.vat_amount_usd)}</span>)
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              פטור ממע״מ — עד <span dir="ltr" className="ms-1">$75</span>
            </span>
          )}

          {deal.historical_low_usd > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              שפל היסטורי:{" "}
              <span dir="ltr" className="font-semibold tabular-nums">
                {formatUSD(deal.historical_low_usd)}
              </span>
            </span>
          )}
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          <span>פירוט עלות סופית</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Expandable Landed Cost Breakdown */}
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-5 dark:border-slate-800 dark:bg-slate-950">
          <div>
            <div className="text-slate-500 dark:text-slate-400">מחיר בסיס</div>
            <div className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
              <span dir="ltr">{formatUSD(cb.base_price_usd)}</span>
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">הנחת קופון</div>
            <div className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              <span dir="ltr">-{formatUSD(cb.coupon_discount_usd)}</span>
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">משלוח</div>
            <div className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
              <span dir="ltr">{formatUSD(cb.shipping_usd)}</span>
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">
              {cb.vat_applied ? "מע״מ יבוא 18%" : "פטור ממע״מ — עד $75"}
            </div>
            <div className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
              <span dir="ltr">
                {cb.vat_applied ? formatUSD(cb.vat_amount_usd) : "$0.00"}
              </span>
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">שער המרה</div>
            <div className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
              <span dir="ltr">₪{cb.fx_rate_ils.toFixed(2)} / $1</span>
            </div>
          </div>
        </div>
      )}

      {/* Coupons List */}
      {cb.applied_coupons.length > 0 && (
        <div className="mt-3 space-y-2">
          {cb.applied_coupons.map((coupon) => (
            <CouponPill
              key={`${deal.deal_id}-${coupon.code}`}
              coupon={coupon}
              dealId={deal.deal_id}
              storeName={deal.store_name}
              cartTotalUsd={cb.base_price_usd}
            />
          ))}
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openHistoryDrawer(deal.sku || deal.product_id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <History className="h-3.5 w-3.5 text-indigo-500" />
            <span>היסטוריית מחירים</span>
          </button>

          <button
            type="button"
            disabled={watchlistStatus === "saving" || watchlistStatus === "saved"}
            onClick={() => void handleAddWatchlist()}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
              watchlistStatus === "saved"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
            )}
          >
            {watchlistStatus === "saved" ? (
              <BookmarkCheck className="h-3.5 w-3.5" />
            ) : (
              <BookmarkPlus className="h-3.5 w-3.5 text-indigo-500" />
            )}
            <span>{watchlistStatus === "saved" ? "נוסף למעקב" : "הוסף למעקב"}</span>
          </button>
        </div>

        <button
          type="button"
          disabled={checkoutLoading}
          onClick={() => void handleInitiateCheckout()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          <span>{checkoutLoading ? "מכין אישור..." : "רכישה מאובטחת (HITL)"}</span>
        </button>
      </div>

      {actionMessage && (
        <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          {actionMessage}
        </p>
      )}
    </article>
  );
}
