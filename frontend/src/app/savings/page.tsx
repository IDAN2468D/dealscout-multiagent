"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Coins,
  History,
  PieChart as PieChartIcon,
  PiggyBank,
  Search,
  ShieldAlert,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { apiFetch } from "@/lib/apiClient";
import { cn, formatDateHe, formatILS, formatUSD } from "@/lib/formatters";
import type { SavingsSummaryResponse, SearchHistoryEntry } from "@/types/api";

interface BreakdownItem {
  key: string;
  labelHe: string;
  amountIls: number;
  color: string;
}

const SOURCE_META: Record<string, { labelHe: string; color: string; badgeClass: string }> = {
  COUPON: {
    labelHe: "קופונים ומועדונים",
    color: "#10b981",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  TAX_SPLIT: {
    labelHe: "פיצול סל (פטור מע״מ)",
    color: "#6366f1",
    badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  },
  FAKE_SALE_AVOIDED: {
    labelHe: "הימנעות ממבצע פיקטיבי",
    color: "#f59e0b",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
};

function SavingsBreakdownChartInner({
  items,
  chartMode,
}: {
  items: BreakdownItem[];
  chartMode: "bar" | "pie";
}) {
  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        {chartMode === "bar" ? (
          <BarChart data={items} margin={{ top: 12, right: 20, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} />
            <XAxis dataKey="labelHe" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `₪${v}`} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "#334155",
                borderRadius: "12px",
                color: "#f8fafc",
              }}
              formatter={(value: number | string) => [formatILS(Number(value)), "חיסכון"]}
            />
            <Bar dataKey="amountIls" name="חיסכון בש״ח" radius={[8, 8, 0, 0]}>
              {items.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <PieChart>
            <Pie
              data={items}
              dataKey="amountIls"
              nameKey="labelHe"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={96}
              paddingAngle={4}
            >
              {items.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "#334155",
                borderRadius: "12px",
                color: "#f8fafc",
              }}
              formatter={(value: number | string) => [formatILS(Number(value)), "חיסכון"]}
            />
            <Legend />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

const DynamicSavingsChart = dynamic(() => Promise.resolve(SavingsBreakdownChartInner), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800/60" />
  ),
});

function SavingsContent() {
  const [chartMode, setChartMode] = useState<"bar" | "pie">("bar");

  const savingsQuery = useQuery({
    queryKey: ["user-savings"],
    queryFn: () => apiFetch<SavingsSummaryResponse>("/api/v1/users/me/savings"),
  });

  const historyQuery = useQuery({
    queryKey: ["user-history"],
    queryFn: () => apiFetch<SearchHistoryEntry[]>("/api/v1/users/me/history"),
  });

  const savings = savingsQuery.data;
  const history = historyQuery.data ?? [];

  const breakdownMap = savings?.breakdown_by_source ?? {};
  const coreKeys = ["COUPON", "TAX_SPLIT", "FAKE_SALE_AVOIDED"];
  const allKeys = Array.from(new Set([...coreKeys, ...Object.keys(breakdownMap)]));

  const chartItems: BreakdownItem[] = allKeys.map((key) => {
    const meta = SOURCE_META[key] ?? {
      labelHe: key,
      color: "#64748b",
      badgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    };
    return {
      key,
      labelHe: meta.labelHe,
      amountIls: Number(breakdownMap[key] ?? 0),
      color: meta.color,
    };
  });

  const hasChartValues = chartItems.some((item) => item.amountIls > 0);
  const isLoading = savingsQuery.isLoading || historyQuery.isLoading;
  const hasError = savingsQuery.isError || historyQuery.isError;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <PiggyBank className="h-7 w-7 text-emerald-500" />
            <span>דשבורד חיסכון והיסטוריית חיפושים</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            מעקב מצטבר אחר חיסכון מקופונים, פיצול חבילות עד $75 והימנעות ממבצעים פיקטיביים.
          </p>
        </div>
      </header>

      {hasError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>אירעה שגיאה בטעינת נתוני החיסכון וההיסטוריה.</span>
          </span>
          <button
            type="button"
            onClick={() => {
              savingsQuery.refetch();
              historyQuery.refetch();
            }}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
          >
            נסה שוב
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/30 bg-white p-5 shadow-sm dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>סה״כ חיסכון בש״ח</span>
            <PiggyBank className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {isLoading ? (
              <span className="inline-block h-8 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              <span dir="ltr" className="tabular-nums">
                {formatILS(savings?.total_saved_ils ?? 0)}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>חיסכון בדולר</span>
            <Coins className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            {isLoading ? (
              <span className="inline-block h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              <span dir="ltr" className="tabular-nums">
                {formatUSD(savings?.total_saved_usd ?? 0)}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>מספר חיפושים</span>
            <Search className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            {isLoading ? (
              <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              <span dir="ltr" className="tabular-nums">
                {history.length}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Breakdown Chart */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              פילוח חיסכון לפי מקור
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span dir="ltr">COUPON</span> · <span dir="ltr">TAX_SPLIT</span> ·{" "}
              <span dir="ltr">FAKE_SALE_AVOIDED</span>
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setChartMode("bar")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                chartMode === "bar"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                  : "text-slate-600 dark:text-slate-400",
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>עמודות</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode("pie")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                chartMode === "pie"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                  : "text-slate-600 dark:text-slate-400",
              )}
            >
              <PieChartIcon className="h-3.5 w-3.5" />
              <span>עוגה</span>
            </button>
          </div>
        </div>

        {!hasChartValues && chartMode === "pie" ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            טרם נרשמו רשומות חיסכון להצגה בגרף עוגה. בצע חיפוש מבצעים או פיצול סל!
          </div>
        ) : (
          <DynamicSavingsChart items={chartItems} chartMode={chartMode} />
        )}
      </section>

      {/* Savings Ledger Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          יומן חיסכון מפורט (Savings Ledger)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2.5 pe-4 text-start">מקור</th>
                <th className="py-2.5 pe-4 text-start">תיאור</th>
                <th className="py-2.5 pe-4 text-start">מק״ט</th>
                <th className="py-2.5 pe-4 text-start">חיסכון בש״ח</th>
                <th className="py-2.5 pe-4 text-start">חיסכון בדולר</th>
                <th className="py-2.5 text-start">תאריך</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {(savings?.recent_entries ?? []).map((entry) => {
                const meta = SOURCE_META[entry.source_type];
                return (
                  <tr key={entry.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 pe-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          meta?.badgeClass ??
                            "bg-slate-500/15 text-slate-700 dark:text-slate-300",
                        )}
                      >
                        {meta?.labelHe ?? entry.source_type}
                      </span>
                    </td>
                    <td className="py-3 pe-4 text-slate-700 dark:text-slate-300">
                      {entry.description || "—"}
                    </td>
                    <td className="py-3 pe-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                      <span dir="ltr">{entry.reference_sku || "—"}</span>
                    </td>
                    <td className="py-3 pe-4 font-semibold text-emerald-600 dark:text-emerald-400">
                      <span dir="ltr" className="tabular-nums">
                        {formatILS(entry.saved_ils)}
                      </span>
                    </td>
                    <td className="py-3 pe-4 text-slate-700 dark:text-slate-300">
                      <span dir="ltr" className="tabular-nums">
                        {formatUSD(entry.saved_usd)}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-slate-500 dark:text-slate-400">
                      <span dir="ltr">{formatDateHe(entry.created_at)}</span>
                    </td>
                  </tr>
                );
              })}
              {(savings?.recent_entries ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    אין עדיין רשומות חיסכון. הרץ חיפוש או אופטימיזציית סל כדי להתחיל לצבור חיסכון!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Personal Search History Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <History className="h-5 w-5 text-indigo-500" />
          <span>היסטוריית חיפושים אישית</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2.5 pe-4 text-start">שאילתה</th>
                <th className="py-2.5 pe-4 text-start">מודל</th>
                <th className="py-2.5 pe-4 text-start">מחיר סופי מיטבי</th>
                <th className="py-2.5 pe-4 text-start">טוקנים (In / Cache / Out)</th>
                <th className="py-2.5 pe-4 text-start">זמן ריצה</th>
                <th className="py-2.5 text-start">תאריך</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {history.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 pe-4 font-medium text-slate-900 dark:text-slate-100">
                    {item.query}
                  </td>
                  <td className="py-3 pe-4">
                    <span
                      dir="ltr"
                      className="rounded bg-indigo-500/10 px-2 py-0.5 font-mono text-xs text-indigo-700 dark:text-indigo-300"
                    >
                      {item.model_id}
                    </span>
                  </td>
                  <td className="py-3 pe-4 font-semibold text-emerald-600 dark:text-emerald-400">
                    {item.best_landed_ils != null ? (
                      <span dir="ltr" className="tabular-nums">
                        {formatILS(item.best_landed_ils)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 pe-4 text-xs text-slate-600 dark:text-slate-400">
                    <span dir="ltr" className="tabular-nums">
                      {item.input_tokens} / {item.cached_tokens} / {item.output_tokens}
                    </span>
                  </td>
                  <td className="py-3 pe-4 text-xs text-slate-600 dark:text-slate-400">
                    <span dir="ltr" className="tabular-nums">
                      {Math.round(item.duration_ms)} ms
                    </span>
                  </td>
                  <td className="py-3 text-xs text-slate-500 dark:text-slate-400">
                    <span dir="ltr">{formatDateHe(item.created_at)}</span>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    לא בוצעו חיפושים עדיין בחשבון זה.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function SavingsPage() {
  return (
    <AuthGuard>
      <SavingsContent />
    </AuthGuard>
  );
}
