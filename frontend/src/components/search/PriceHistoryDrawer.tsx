"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingDown, X } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { formatUSD } from "@/lib/formatters";
import { useSearchStore } from "@/store/searchStore";
import type { PriceHistoryResponse } from "@/types/api";

interface ChartPoint {
  dateLabel: string;
  price_usd: number;
  original_listed_usd: number | null;
  store_name: string;
}

interface PriceHistoryChartProps {
  points: ChartPoint[];
  historicalLowUsd: number;
  avg90dUsd: number;
}

function PriceHistoryChartInner({
  points,
  historicalLowUsd,
  avg90dUsd,
}: PriceHistoryChartProps) {
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="dealscoutPriceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.4} />
          <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `$${v}`}
            domain={["auto", "auto"]}
          />
          <Tooltip
            formatter={(value: number) => [`$${Number(value).toFixed(2)}`, "מחיר (USD)"]}
          />
          <ReferenceLine
            y={historicalLowUsd}
            stroke="#10b981"
            strokeDasharray="4 4"
            label={{
              value: `All-Time Low $${historicalLowUsd.toFixed(0)}`,
              fill: "#059669",
              fontSize: 11,
              position: "insideBottomRight",
            }}
          />
          <ReferenceLine
            y={avg90dUsd}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{
              value: `90d Avg $${avg90dUsd.toFixed(0)}`,
              fill: "#d97706",
              fontSize: 11,
              position: "insideTopRight",
            }}
          />
          <Area
            type="monotone"
            dataKey="price_usd"
            stroke="#4f46e5"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#dealscoutPriceGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const DynamicPriceHistoryChart = dynamic(
  () => Promise.resolve(PriceHistoryChartInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-500 dark:bg-slate-800">
        טוען גרף היסטוריית מחירים...
      </div>
    ),
  },
);

export function PriceHistoryDrawer() {
  const selectedProductId = useSearchStore((s) => s.selectedHistoryProductId);
  const closeHistoryDrawer = useSearchStore((s) => s.closeHistoryDrawer);

  useEffect(() => {
    if (!selectedProductId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeHistoryDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeHistoryDrawer, selectedProductId]);

  const { data, isLoading, error } = useQuery<PriceHistoryResponse>({
    queryKey: ["price-history", selectedProductId],
    queryFn: () =>
      apiFetch<PriceHistoryResponse>(
        `/api/v1/deals/${encodeURIComponent(selectedProductId || "")}/history`,
      ),
    enabled: Boolean(selectedProductId),
    staleTime: 300_000,
  });

  if (!selectedProductId) {
    return null;
  }

  const chartPoints: ChartPoint[] = (data?.points || []).map((p) => ({
    dateLabel: new Date(p.recorded_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    price_usd: p.price_usd,
    original_listed_usd: p.original_listed_usd ?? null,
    store_name: p.store_name,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="היסטוריית מחירים 90-180 יום"
      onClick={closeHistoryDrawer}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white p-5 shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                היסטוריית מחירים וניתוח מבצעים
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                מק״ט / מוצר:{" "}
                <span dir="ltr" className="font-mono font-semibold">
                  {data?.sku || selectedProductId}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="סגור מגירה"
            onClick={closeHistoryDrawer}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-4">
          {isLoading && (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
            >
              {error instanceof ApiError && error.status === 401
                ? "יש להתחבר לחשבון כדי לצפות בהיסטוריית המחירים המלאה."
                : error instanceof Error
                  ? error.message
                  : "שגיאה בטעינת היסטוריית המחירים."}
            </div>
          )}

          {data && (
            <>
              {data.fake_discount_flag && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <div>
                    <div className="font-bold">זוהה זינוק מחיר מלאכותי לפני מבצע!</div>
                    <p className="mt-0.5">
                      המחיר קפץ ב-
                      <span dir="ltr" className="mx-1 font-bold tabular-nums">
                        +{data.spike_pct.toFixed(1)}%
                      </span>
                      לשיא של{" "}
                      <span dir="ltr" className="font-bold tabular-nums">
                        {formatUSD(data.max_30d_pre_sale_usd)}
                      </span>{" "}
                      בתוך 30 יום לפני ההנחה הנוכחית.
                    </p>
                  </div>
                </div>
              )}

              {/* KPI Metrics */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[11px] text-slate-500">מחיר נוכחי</div>
                  <div className="mt-1 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    <span dir="ltr">{formatUSD(data.current_price_usd)}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    שפל היסטורי
                  </div>
                  <div className="mt-1 text-sm font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                    <span dir="ltr">{formatUSD(data.historical_low_usd)}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
                  <div className="text-[11px] text-amber-700 dark:text-amber-300">
                    ממוצע 90 יום
                  </div>
                  <div className="mt-1 text-sm font-bold tabular-nums text-amber-800 dark:text-amber-200">
                    <span dir="ltr">{formatUSD(data.avg_90d_usd)}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[11px] text-slate-500">שיא 30 יום</div>
                  <div className="mt-1 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    <span dir="ltr">{formatUSD(data.max_30d_pre_sale_usd)}</span>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                {chartPoints.length > 0 ? (
                  <DynamicPriceHistoryChart
                    points={chartPoints}
                    historicalLowUsd={data.historical_low_usd}
                    avg90dUsd={data.avg_90d_usd}
                  />
                ) : (
                  <p className="py-12 text-center text-xs text-slate-500">
                    אין מספיק נקודות היסטוריה לתצוגה עבור מוצר זה.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
