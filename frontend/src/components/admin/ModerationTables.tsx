"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, ShieldAlert, Tag } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { cn } from "@/lib/formatters";
import type { AdminModerationResponse } from "@/types/api";

interface ModerationTablesProps {
  data: AdminModerationResponse;
}

interface ModerateCouponVars {
  code: string;
  store_name: string;
  action: "suppress" | "restore";
}

function toPercent(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return rate <= 1 ? Math.round(rate * 100) : Math.round(rate);
}

export function ModerationTables({ data }: ModerationTablesProps) {
  const queryClient = useQueryClient();
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const moderateMutation = useMutation({
    mutationFn: ({ code, store_name, action }: ModerateCouponVars) =>
      apiFetch<{
        code: string;
        store_name: string;
        action: string;
        success_rate: number;
        total_votes: number;
        suppressed: boolean;
      }>(`/api/v1/admin/coupons/${encodeURIComponent(code)}/moderate`, {
        method: "POST",
        body: JSON.stringify({ store_name, action }),
      }),
    onSuccess: (res) => {
      setErrorBanner(null);
      setStatusBanner(
        res.action === "suppress"
          ? `הקופון ${res.code} (${res.store_name}) הושעה בהצלחה.`
          : `הקופון ${res.code} (${res.store_name}) שוחזר בהצלחה.`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-moderation"] });
    },
    onError: (err) => {
      setStatusBanner(null);
      setErrorBanner(err instanceof Error ? err.message : "שגיאה בעדכון סטטוס הקופון");
    },
  });

  return (
    <div className="space-y-6">
      {statusBanner && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300"
        >
          {statusBanner}
        </div>
      )}
      {errorBanner && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {errorBanner}
        </div>
      )}

      {/* Community Coupons Moderation Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              <Tag className="h-5 w-5 text-indigo-500" />
              <span>מודרציית קופונים מהקהילה (Redis Crowd Score)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              קופונים מתחת לסף 35% הצלחה מושעים אוטומטית; ניתן להשעות או לשחזר ידנית.
            </p>
          </div>
          <span
            dir="ltr"
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {data.coupons.length} coupons
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2.5 pe-4 text-start">קוד קופון</th>
                <th className="py-2.5 pe-4 text-start">חנות</th>
                <th className="py-2.5 pe-4 text-start">אחוז הצלחה</th>
                <th className="py-2.5 pe-4 text-start">הצבעות</th>
                <th className="py-2.5 pe-4 text-start">סטטוס</th>
                <th className="py-2.5 text-end">פעולה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {data.coupons.map((coupon) => {
                const pct = toPercent(coupon.success_rate);
                const isPendingRow =
                  moderateMutation.isPending &&
                  moderateMutation.variables?.code === coupon.code &&
                  moderateMutation.variables?.store_name === coupon.store_name;

                return (
                  <tr
                    key={`${coupon.store_name}-${coupon.code}`}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 pe-4">
                      <div className="flex items-center gap-2">
                        <span
                          dir="ltr"
                          className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {coupon.code}
                        </span>
                        {coupon.required_club && (
                          <span
                            dir="ltr"
                            className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300"
                          >
                            {coupon.required_club}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pe-4 text-slate-700 dark:text-slate-300">
                      <span dir="ltr">{coupon.store_name}</span>
                    </td>
                    <td className="py-3 pe-4">
                      <span
                        dir="ltr"
                        className={cn(
                          "font-semibold tabular-nums",
                          pct < 35
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {pct}%
                      </span>
                    </td>
                    <td className="py-3 pe-4 text-slate-600 dark:text-slate-400">
                      <span dir="ltr" className="tabular-nums">
                        {coupon.total_votes}
                      </span>
                    </td>
                    <td className="py-3 pe-4">
                      {coupon.suppressed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                          <Ban className="h-3 w-3" />
                          <span>מושעה</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>פעיל</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-end">
                      <button
                        type="button"
                        disabled={isPendingRow}
                        onClick={() =>
                          moderateMutation.mutate({
                            code: coupon.code,
                            store_name: coupon.store_name,
                            action: coupon.suppressed ? "restore" : "suppress",
                          })
                        }
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                          coupon.suppressed
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                            : "border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300",
                        )}
                      >
                        {isPendingRow
                          ? "מעדכן..."
                          : coupon.suppressed
                            ? "שחזר (Restore)"
                            : "השעה (Suppress)"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {data.coupons.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    אין קופונים להצגה כרגע.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Blocked Scam / Prompt Injection Sellers Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              <ShieldAlert className="h-5 w-5 text-rose-500" />
              <span>מוכרים חסומים וניסיונות Prompt Injection</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              מוכרים שנחסמו ע״י שומר הסף (<span dir="ltr">seller_trust_score &lt; 70</span>) או עקב הזרקת פרומפט זדונית.
            </p>
          </div>
          <span
            dir="ltr"
            className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-300"
          >
            {data.blocked_sellers.length} blocked
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2.5 pe-4 text-start">מוכר</th>
                <th className="py-2.5 pe-4 text-start">חנות</th>
                <th className="py-2.5 pe-4 text-start">ציון אמינות</th>
                <th className="py-2.5 pe-4 text-start">איומים שזוהו</th>
                <th className="py-2.5 pe-4 text-start">סיבה</th>
                <th className="py-2.5 text-start">מוצר</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {data.blocked_sellers.map((seller) => (
                <tr
                  key={seller.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="py-3 pe-4 font-semibold text-slate-900 dark:text-slate-100">
                    <span dir="ltr">{seller.seller_name}</span>
                  </td>
                  <td className="py-3 pe-4 text-slate-700 dark:text-slate-300">
                    <span dir="ltr">{seller.store_name}</span>
                  </td>
                  <td className="py-3 pe-4">
                    <span
                      dir="ltr"
                      className="rounded bg-rose-500/15 px-2 py-0.5 text-xs font-bold tabular-nums text-rose-700 dark:text-rose-300"
                    >
                      {seller.seller_trust_score}/100
                    </span>
                  </td>
                  <td className="py-3 pe-4">
                    <div className="flex flex-wrap gap-1">
                      {(seller.threats || []).map((threat) => (
                        <span
                          key={threat}
                          dir="ltr"
                          className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-amber-700 dark:text-amber-300"
                        >
                          {threat}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 pe-4 text-xs text-slate-600 dark:text-slate-400">
                    {seller.reason}
                  </td>
                  <td className="py-3 text-xs text-slate-500 dark:text-slate-400">
                    <span dir="ltr" className="font-mono">
                      {seller.product_id || "—"}
                    </span>
                  </td>
                </tr>
              ))}
              {data.blocked_sellers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    לא זוהו מוכרים חסומים.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
