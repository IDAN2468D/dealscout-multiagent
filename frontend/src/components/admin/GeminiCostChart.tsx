"use client";

import dynamic from "next/dynamic";
import { Activity, Cpu, Database, DollarSign, Layers, Sparkles } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminTelemetryResponse } from "@/types/api";

interface GeminiCostChartProps {
  telemetry: AdminTelemetryResponse;
}

interface ChartPoint {
  label: string;
  query: string;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  llm_cost_usd: number;
}

function GeminiCostChartInner({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-80 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} />
          <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
          <YAxis yAxisId="tokens" stroke="#94a3b8" fontSize={12} />
          <YAxis
            yAxisId="cost"
            orientation="right"
            stroke="#10b981"
            fontSize={12}
            tickFormatter={(v) => `$${Number(v).toFixed(4)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              borderColor: "#334155",
              borderRadius: "12px",
              color: "#f8fafc",
            }}
            formatter={(value: number | string, name: string) => {
              if (name === "עלות USD") {
                return [`$${Number(value).toFixed(6)}`, name];
              }
              return [Number(value).toLocaleString("en-US"), name];
            }}
          />
          <Legend />
          <Bar
            yAxisId="tokens"
            dataKey="input_tokens"
            name="Input Tokens"
            fill="#6366f1"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            yAxisId="tokens"
            dataKey="cached_tokens"
            name="Cached Tokens"
            fill="#10b981"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            yAxisId="tokens"
            dataKey="output_tokens"
            name="Output Tokens"
            fill="#f59e0b"
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="cost"
            type="monotone"
            dataKey="llm_cost_usd"
            name="עלות USD"
            stroke="#34d399"
            strokeWidth={2.5}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const DynamicGeminiRecharts = dynamic(() => Promise.resolve(GeminiCostChartInner), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800/60" />
  ),
});

export function GeminiCostChart({ telemetry }: GeminiCostChartProps) {
  const recent = telemetry.recent_searches ?? [];
  const chartData: ChartPoint[] = recent
    .slice(0, 15)
    .reverse()
    .map((item, idx) => ({
      label: `#${idx + 1}`,
      query: item.query,
      input_tokens: Number(item.input_tokens || 0),
      cached_tokens: Number(item.cached_tokens || 0),
      output_tokens: Number(item.output_tokens || 0),
      llm_cost_usd: Number(item.llm_cost_usd || 0),
    }));

  const cacheModel = telemetry.context_cache?.model || telemetry.default_model || "gemini-3.5-flash-lite";
  const cacheTtl = telemetry.context_cache?.ttl_seconds ?? 3600;
  const cacheMode = telemetry.context_cache?.mode || "local_fallback";
  const totalCost =
    telemetry.total_llm_cost_usd > 0
      ? telemetry.total_llm_cost_usd
      : (telemetry.db_totals?.llm_cost_usd ?? 0);

  return (
    <div className="space-y-5">
      {/* KPI & Context Cache Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>סטטוס Context Cache</span>
            <Database className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              dir="ltr"
              className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300"
            >
              {cacheModel}
            </span>
            <span
              dir="ltr"
              className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300"
            >
              TTL {cacheTtl}s
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            מצב: <span dir="ltr">{cacheMode}</span>
            {typeof telemetry.context_cache?.policy_count === "number" && (
              <>
                {" · "}
                פוליסות:{" "}
                <span dir="ltr" className="tabular-nums">
                  {telemetry.context_cache.policy_count}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>ספאנים ב-OpenTelemetry</span>
            <Activity className="h-4 w-4 text-indigo-500" />
          </div>
          <div
            dir="ltr"
            className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100"
          >
            {Number(telemetry.total_otel_spans || 0).toLocaleString("en-US")}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            אירועי Langfuse:{" "}
            <span dir="ltr" className="font-semibold tabular-nums">
              {Number(telemetry.total_langfuse_events || 0).toLocaleString("en-US")}
            </span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>טוקנים (Input / Cached / Output)</span>
            <Cpu className="h-4 w-4 text-amber-500" />
          </div>
          <div
            dir="ltr"
            className="mt-2 flex flex-wrap items-baseline gap-2 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100"
          >
            <span className="text-indigo-600 dark:text-indigo-400">
              {Number(telemetry.total_input_tokens || telemetry.db_totals?.input_tokens || 0).toLocaleString("en-US")}
            </span>
            <span>/</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              {Number(telemetry.total_cached_tokens || telemetry.db_totals?.cached_tokens || 0).toLocaleString("en-US")}
            </span>
            <span>/</span>
            <span className="text-amber-600 dark:text-amber-400">
              {Number(telemetry.total_output_tokens || telemetry.db_totals?.output_tokens || 0).toLocaleString("en-US")}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            חיפושים מתועדים:{" "}
            <span dir="ltr" className="font-semibold tabular-nums">
              {telemetry.total_searches_recorded || telemetry.db_totals?.total_searches || 0}
            </span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>עלות מצטברת Gemini</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div
            dir="ltr"
            className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
          >
            ${Number(totalCost).toFixed(6)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            זמן ממוצע:{" "}
            <span dir="ltr" className="tabular-nums">
              {Math.round(telemetry.avg_duration_ms || 0)}ms
            </span>
          </p>
        </div>
      </div>

      {/* Main Chart Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              <span>ניטור טוקנים ועלויות בחיפושים אחרונים</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              חלוקת <span dir="ltr">input_tokens</span>, <span dir="ltr">cached_tokens</span>,{" "}
              <span dir="ltr">output_tokens</span> ועלות <span dir="ltr">llm_cost_usd</span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <Layers className="h-3.5 w-3.5" />
            <span dir="ltr">{telemetry.service_name}</span>
          </span>
        </div>

        {chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            עדיין לא נרשמו חיפושים בטלמטריה. בצע חיפוש מוצר כדי לצפות בגרף הטוקנים.
          </div>
        ) : (
          <DynamicGeminiRecharts data={chartData} />
        )}
      </section>
    </div>
  );
}
