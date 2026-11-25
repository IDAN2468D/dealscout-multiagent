"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Tag,
  X,
  XCircle,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { cn, formatILS, formatUSD } from "@/lib/formatters";
import { useSearchStore } from "@/store/searchStore";

interface CheckoutApprovalApiResponse {
  approval_id: string;
  user_id: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  product_title: string;
  store_name: string;
  total_landed_ils: number;
  affiliate_url: string;
  user_note?: string | null;
  message: string;
}

const FIVE_MINUTES_SEC = 5 * 60;

function computeRemainingSeconds(expiresAt?: string): number {
  if (!expiresAt) return FIVE_MINUTES_SEC;
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return FIVE_MINUTES_SEC;
  const diff = Math.floor((target - Date.now()) / 1000);
  if (diff <= 0) return 0;
  return Math.min(diff, FIVE_MINUTES_SEC);
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function CheckoutApprovalModal() {
  const pendingApproval = useSearchStore((s) => s.pendingApproval);
  const setPendingApproval = useSearchStore((s) => s.setPendingApproval);

  const [userNote, setUserNote] = useState("");
  const [submitting, setSubmitting] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approvedResult, setApprovedResult] =
    useState<CheckoutApprovalApiResponse | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(FIVE_MINUTES_SEC);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const approvalKey = pendingApproval?.approval_id ?? null;

  useEffect(() => {
    if (!pendingApproval) {
      setUserNote("");
      setSubmitting(null);
      setErrorMsg(null);
      setApprovedResult(null);
      return;
    }

    setUserNote(pendingApproval.user_note || "");
    setErrorMsg(null);
    setApprovedResult(
      pendingApproval.status === "APPROVED"
        ? {
            approval_id: pendingApproval.approval_id,
            user_id: "",
            status: "APPROVED",
            product_title: pendingApproval.deal.product_title,
            store_name: pendingApproval.deal.store_name,
            total_landed_ils: pendingApproval.deal.cost_breakdown.total_landed_ils,
            affiliate_url:
              pendingApproval.deal.affiliate_url || pendingApproval.deal.product_url,
            user_note: pendingApproval.user_note,
            message: "האישור בוצע בהצלחה. ניתן להמשיך לקישור הרכישה המאובטח.",
          }
        : null,
    );
    setRemainingSec(computeRemainingSeconds(pendingApproval.expires_at));
  }, [approvalKey]);

  useEffect(() => {
    if (!pendingApproval || approvedResult) return;

    const timer = window.setInterval(() => {
      setRemainingSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [pendingApproval, approvedResult]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    setPendingApproval(null);
  }, [setPendingApproval, submitting]);

  // Accessible focus management & Escape key close + Focus Trap
  useEffect(() => {
    if (!pendingApproval) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [pendingApproval, handleClose]);

  const isExpired = remainingSec <= 0 && !approvedResult;

  const trustMeta = useMemo(() => {
    const score = pendingApproval?.deal.seller_trust_score ?? 0;
    if (score >= 85) {
      return {
        label: "אמינות גבוהה",
        barColor: "bg-emerald-500",
        textColor: "text-emerald-400",
      };
    }
    if (score >= 70) {
      return {
        label: "אמינות בינונית",
        barColor: "bg-amber-500",
        textColor: "text-amber-400",
      };
    }
    return {
      label: "סיכון מוכר נמוך",
      barColor: "bg-rose-500",
      textColor: "text-rose-400",
    };
  }, [pendingApproval?.deal.seller_trust_score]);

  if (!pendingApproval) {
    return null;
  }

  const { deal } = pendingApproval;
  const cb = deal.cost_breakdown;

  async function submitDecision(decision: "APPROVED" | "REJECTED") {
    if (!pendingApproval || submitting) return;
    setSubmitting(decision);
    setErrorMsg(null);

    try {
      const res = await apiFetch<CheckoutApprovalApiResponse>(
        "/api/v1/deals/approve-checkout",
        {
          method: "POST",
          body: JSON.stringify({
            approval_id: pendingApproval.approval_id,
            decision,
            user_note: userNote.trim() || null,
          }),
        },
      );

      if (decision === "APPROVED") {
        setApprovedResult(res);
        setPendingApproval({
          ...pendingApproval,
          status: "APPROVED",
          user_note: userNote.trim() || null,
        });
      } else {
        setPendingApproval(null);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "שגיאה בשליחת החלטת האישור. נסה שוב.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hitl-modal-title"
        aria-describedby="hitl-modal-desc"
        dir="rtl"
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700/70 bg-white text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-500">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-500">
                שער אישור אנושי (HITL)
              </span>
              <h2 id="hitl-modal-title" className="mt-1 text-lg font-bold">
                אישור ביצוע רכישה לפני מעבר לקופה
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!approvedResult && (
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold",
                  remainingSec <= 60
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-500",
                )}
                title="זמן שנותר לתוקף האישור"
              >
                <Clock className="h-3.5 w-3.5" />
                <span dir="ltr" className="tabular-nums">
                  {formatCountdown(remainingSec)}
                </span>
              </div>
            )}

            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleClose}
              aria-label="סגור חלון אישור"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          <p id="hitl-modal-desc" className="text-sm text-slate-600 dark:text-slate-300">
            {pendingApproval.reason ||
              "הסוכן עצר את התהליך לפני פתיחת קישור הרכישה לצורך בדיקה ואישור מפורש שלך."}
          </p>

          {approvedResult ? (
            <div className="space-y-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    הרכישה אושרה בהצלחה (APPROVED)
                  </h3>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {approvedResult.message}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-500/20 bg-white/70 p-3 text-sm dark:bg-slate-950/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{approvedResult.product_title}</span>
                  <span dir="ltr" className="font-bold tabular-nums text-emerald-500">
                    {formatILS(approvedResult.total_landed_ils)}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  <span dir="ltr">{approvedResult.affiliate_url}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingApproval(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  סגור חלון
                </button>
                <a
                  href={approvedResult.affiliate_url || deal.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
                >
                  <span>המשך לרכישה ב-{approvedResult.store_name}</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Product + Seller Trust Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-indigo-500">{deal.store_name}</span>
                      <span>•</span>
                      <span>
                        מק״ט: <span dir="ltr">{deal.sku || deal.product_id}</span>
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-bold">{deal.product_title}</h3>
                  </div>
                  <div className="text-end">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      מחיר סופי עד הבית
                    </div>
                    <div dir="ltr" className="text-xl font-extrabold tabular-nums text-emerald-500">
                      {formatILS(cb.total_landed_ils)}
                    </div>
                    <div dir="ltr" className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatUSD(cb.total_landed_usd)}
                    </div>
                  </div>
                </div>

                {/* Seller Trust Score Bar */}
                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">
                      מוכר: <strong className="font-semibold">{deal.seller_name}</strong>
                    </span>
                    <span className={cn("font-semibold", trustMeta.textColor)}>
                      {trustMeta.label} (<span dir="ltr">{deal.seller_trust_score}/100</span>)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className={cn("h-full rounded-full transition-all", trustMeta.barColor)}
                      style={{
                        width: `${Math.min(100, Math.max(0, deal.seller_trust_score))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Landed Cost Breakdown */}
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h4 className="mb-3 text-sm font-bold">פירוט עלות סופית (Landed Cost)</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">מחיר בסיס</span>
                    <span dir="ltr" className="tabular-nums font-medium">
                      {formatUSD(cb.base_price_usd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">הנחת קופונים</span>
                    <span dir="ltr" className="tabular-nums font-medium text-emerald-500">
                      -{formatUSD(cb.coupon_discount_usd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">משלוח</span>
                    <span dir="ltr" className="tabular-nums font-medium">
                      {cb.shipping_usd === 0 ? "חינם ($0.00)" : formatUSD(cb.shipping_usd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">מע״מ יבוא (ישראל 18%)</span>
                    {cb.vat_applied ? (
                      <span dir="ltr" className="tabular-nums font-medium text-amber-500">
                        {formatUSD(cb.vat_amount_usd)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                        פטור ממע״מ (עד <span dir="ltr">$75</span>)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-bold dark:border-slate-800">
                    <span>סה״כ לתשלום (שער <span dir="ltr">{cb.fx_rate_ils}</span>)</span>
                    <div className="flex items-center gap-2">
                      <span dir="ltr" className="tabular-nums text-slate-500">
                        {formatUSD(cb.total_landed_usd)}
                      </span>
                      <span>/</span>
                      <span dir="ltr" className="tabular-nums text-emerald-500">
                        {formatILS(cb.total_landed_ils)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Applied Coupons */}
              {cb.applied_coupons.length > 0 && (
                <div className="space-y-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-bold">
                    <Tag className="h-4 w-4 text-emerald-500" />
                    <span>קופונים שיוחלו בעסקה</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {cb.applied_coupons.map((coupon) => (
                      <div
                        key={coupon.code}
                        className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs"
                      >
                        <span dir="ltr" className="font-mono font-bold text-emerald-500">
                          {coupon.code}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {coupon.discount_description}
                        </span>
                        <span dir="ltr" className="tabular-nums text-slate-400">
                          ({coupon.success_rate}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compatibility / Fake-Discount Warnings */}
              {(deal.compatibility_warnings.length > 0 || deal.fake_discount_flag) && (
                <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-sm">
                  <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>אזהרות תאימות ובדיקת איכות</span>
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-xs text-slate-700 dark:text-slate-200">
                    {deal.fake_discount_flag && (
                      <li className="text-rose-500">
                        זוהתה העלאת מחיר מלאכותית לפני המבצע (Fake Discount).
                      </li>
                    )}
                    {deal.compatibility_warnings.map((warn, idx) => (
                      <li key={idx}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}

              {isExpired && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs font-semibold text-rose-500">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>פג תוקף בקשת האישור (5 דקות). ניתן לבטל ולפתוח בקשה חדשה מכרטיס העסקה.</span>
                </div>
              )}

              {/* Optional user note */}
              <div>
                <label
                  htmlFor="hitl-user-note"
                  className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  הערה אופציונלית לתיעוד ביומן הביקורת (Audit Log)
                </label>
                <input
                  id="hitl-user-note"
                  type="text"
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                  placeholder="למשל: מאושר לרכישה עם משלוח רגיל"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">
                  {errorMsg}
                </div>
              )}

              {/* Decision Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => submitDecision("REJECTED")}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-500 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  <span>{submitting === "REJECTED" ? "מבטל..." : "ביטול (REJECTED)"}</span>
                </button>

                <button
                  type="button"
                  disabled={submitting !== null || isExpired}
                  onClick={() => submitDecision("APPROVED")}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {submitting === "APPROVED" ? "מאשר ביצוע..." : "אישור ביצוע (APPROVED)"}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CheckoutApprovalModal;
