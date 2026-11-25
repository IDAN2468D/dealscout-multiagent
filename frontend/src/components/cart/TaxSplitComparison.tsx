"use client";

import React from "react";
import dynamic from "next/dynamic";
import { ArrowLeftRight, CheckCircle2, Package, PiggyBank, Receipt } from "lucide-react";
import { cn, formatILS, formatUSD } from "@/lib/formatters";
import type { CartSplitResponse } from "@/types/api";

interface TaxSplitComparisonProps {
  result?: CartSplitResponse | null;
  isLoading?: boolean;
}

const ComparisonBarChart = dynamic(
  async () => {
    const mod = await import("recharts");
    const ChartComponent = ({
      beforeIls,
      afterIls,
    }: {
      beforeIls: number;
      afterIls: number;
    }) => {
      const data = [
        { name: "משלוח מאוחד (לפני)", totalIls: Number(beforeIls.toFixed(2)) },
        { name: "פיצול אופטימלי (אחרי)", totalIls: Number(afterIls.toFixed(2)) },
      ];
      return (
        <div className="h-48 w-full" dir="ltr">
          <mod.ResponsiveContainer width="100%" height="100%">
            <mod.BarChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
              <mod.CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <mod.XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <mod.YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <mod.Tooltip
                formatter={(val: number) => [`₪${val.toFixed(2)}`, "סה״כ בש״ח"]}
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "10px",
                  color: "#f8fafc",
                }}
              />
              <mod.Bar dataKey="totalIls" radius={[8, 8, 0, 0]}>
                <mod.Cell fill="#f43f5e" />
                <mod.Cell fill="#10b981" />
              </mod.Bar>
            </mod.BarChart>
          </mod.ResponsiveContainer>
        </div>
      );
    };
    return ChartComponent;
  },
  {
    ssr: false,
    loading: () => (
      <div className="h-48 w-full animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800/60" />
    ),
  },
);

export function TaxSplitComparison({ result, isLoading = false }: TaxSplitComparisonProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <ArrowLeftRight className="h-10 w-10 text-indigo-400" />
        <h3 className="mt-3 text-base font-bold">השוואת לפני ואחרי תופיע כאן</h3>
        <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          בחר אחד מתרחישי הדוגמה למעלה או הוסף מוצרים לסל ולחץ על &quot;חשב אופטימיזציית פיצול סל&quot;.
        </p>
      </div>
    );
  }

  const isSplit = result.recommended_strategy === "SPLIT_PACKAGES";

  return (
    <div className="space-y-5">
      {/* Highlighted Savings Banner */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5",
          result.saved_ils > 0
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-indigo-500/40 bg-indigo-500/10",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              result.saved_ils > 0
                ? "bg-emerald-500/20 text-emerald-500"
                : "bg-indigo-500/20 text-indigo-500",
            )}
          >
            <PiggyBank className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                {isSplit
                  ? `מומלץ לפצל ל-${result.packages.length} חבילות`
                  : "מומלץ להשאיר במשלוח מאוחד"}
              </span>
              <span className="rounded-full bg-slate-900/10 px-2 py-0.5 text-[11px] font-medium dark:bg-white/10">
                {result.store_name} • <span dir="ltr">{result.ship_to_country}</span>
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              {result.explanation}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-white/80 px-5 py-3 text-center dark:bg-slate-950/60">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            סה״כ חיסכון
          </div>
          <div dir="ltr" className="text-2xl font-black tabular-nums text-emerald-500">
            {formatILS(result.saved_ils)}
          </div>
          <div dir="ltr" className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatUSD(result.saved_usd)}
          </div>
        </div>
      </div>

      {/* Before / After Cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Before: Single Shipment */}
        <div className="flex flex-col justify-between rounded-2xl border border-rose-500/30 bg-white p-5 shadow-sm dark:bg-slate-900">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-rose-500" />
                <h3 className="text-base font-bold">לפני (משלוח מאוחד)</h3>
              </div>
              {result.baseline_vat_usd > 0 ? (
                <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-500">
                  מע״מ ישראל 18%
                </span>
              ) : (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-500">
                  0% מע״מ (עד <span dir="ltr">$75</span>)
                </span>
              )}
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">תוספת מע״מ 18% במשלוח אחד</span>
                <span dir="ltr" className="tabular-nums font-bold text-rose-500">
                  {formatUSD(result.baseline_vat_usd)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">עלות משולבת (USD)</span>
                <span dir="ltr" className="tabular-nums font-semibold">
                  {formatUSD(result.baseline_combined_usd)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-bold dark:border-slate-800">
                <span>סה״כ לפני פיצול (ILS)</span>
                <span dir="ltr" className="tabular-nums text-rose-500">
                  {formatILS(result.baseline_combined_ils)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <ComparisonBarChart
              beforeIls={result.baseline_combined_ils}
              afterIls={result.optimized_total_ils}
            />
          </div>
        </div>

        {/* After: Optimal Split */}
        <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-500" />
              <h3 className="text-base font-bold">אחרי (פיצול אופטימלי)</h3>
            </div>
            <div className="text-end">
              <span dir="ltr" className="text-lg font-extrabold tabular-nums text-emerald-500">
                {formatILS(result.optimized_total_ils)}
              </span>
              <div dir="ltr" className="text-xs tabular-nums text-slate-500">
                {formatUSD(result.optimized_total_usd)}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {result.packages.map((pkg) => (
              <div
                key={pkg.package_index}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">חבילה #{pkg.package_index}</span>
                    {!pkg.vat_applied ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>
                          0% מע״מ (עד <span dir="ltr">$75</span>)
                        </span>
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-500">
                        מע״מ 18% (<span dir="ltr">{formatUSD(pkg.vat_amount_usd)}</span>)
                      </span>
                    )}
                  </div>
                  <div className="text-end">
                    <span dir="ltr" className="text-sm font-bold tabular-nums text-emerald-500">
                      {formatILS(pkg.package_total_ils)}
                    </span>
                    <span dir="ltr" className="ms-2 text-xs tabular-nums text-slate-500">
                      ({formatUSD(pkg.package_total_usd)})
                    </span>
                  </div>
                </div>

                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {pkg.items.map((itemLabel, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                      <span dir="ltr">{itemLabel}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-2.5 flex flex-wrap gap-4 border-t border-slate-200/80 pt-2 text-[11px] text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
                  <span>
                    ביניים: <span dir="ltr" className="tabular-nums">{formatUSD(pkg.items_subtotal_usd)}</span>
                  </span>
                  <span>
                    משלוח:{" "}
                    <span dir="ltr" className="tabular-nums">
                      {pkg.shipping_usd === 0 ? "חינם ($0.00)" : formatUSD(pkg.shipping_usd)}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaxSplitComparison;
