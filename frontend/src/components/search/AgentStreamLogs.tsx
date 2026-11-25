"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { AGENT_LABELS_HE, cn } from "@/lib/formatters";
import { useSearchStore } from "@/store/searchStore";
import type { AgentId } from "@/types/api";

const MCP_TOOL_PILLS = [
  { id: "Elasticsearch", match: ["elastic", "fuzzy_search", "catalog"] },
  { id: "ecommerce_mcp", match: ["search_store_offers", "ecommerce", "stock", "reviews"] },
  { id: "coupons_mcp", match: ["coupon", "stacking", "validate_coupon"] },
  { id: "ChromaDB", match: ["chroma", "rag", "policy", "memory"] },
] as const;

const ALL_AGENT_IDS = Object.keys(AGENT_LABELS_HE) as AgentId[];

interface AgentStreamLogsProps {
  onRetry?: () => void;
}

export function AgentStreamLogs({ onRetry }: AgentStreamLogsProps) {
  const events = useSearchStore((s) => s.events);
  const isStreaming = useSearchStore((s) => s.isStreaming);
  const error = useSearchStore((s) => s.error);

  if (events.length === 0 && !isStreaming && !error) {
    return null;
  }

  const seenAgents = new Set(events.map((e) => e.agent_id));
  const lastActiveAgent = events.length > 0 ? events[events.length - 1].agent_id : null;

  const activeTools = new Set<string>();
  for (const evt of events) {
    const raw = `${evt.tool_name || ""} ${evt.message || ""}`.toLowerCase();
    for (const pill of MCP_TOOL_PILLS) {
      if (pill.match.some((kw) => raw.includes(kw))) {
        activeTools.add(pill.id);
      }
    }
    if (evt.agent_id === "store-search-mcp-agent") {
      activeTools.add("Elasticsearch");
      activeTools.add("ecommerce_mcp");
    }
    if (evt.agent_id === "coupon-hunter-rag-agent") {
      activeTools.add("coupons_mcp");
      activeTools.add("ChromaDB");
    }
  }

  return (
    <aside
      aria-label="פיד חשיבת סוכנים בזמן אמת"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-2.5 w-2.5 rounded-full",
              isStreaming
                ? "animate-pulse bg-indigo-600"
                : error
                  ? "bg-rose-500"
                  : "bg-emerald-500",
            )}
          />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            פיד סוכני DealScout בזמן אמת (SSE)
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Cpu className="h-3 w-3" />
            <span dir="ltr">gemini-3.5-flash-lite</span>
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            <span dir="ltr">{events.length}</span> אירועים
          </span>
        </div>
      </div>

      {/* MCP Tool Pills */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          כלים ומקורות נתונים:
        </span>
        {MCP_TOOL_PILLS.map((tool) => {
          const used = activeTools.has(tool.id);
          return (
            <span
              key={tool.id}
              dir="ltr"
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
                used
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                  : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500",
              )}
            >
              <Wrench className="h-3 w-3" />
              {tool.id}
            </span>
          );
        })}
      </div>

      {/* 9-Agent Pipeline Matrix */}
      <div className="mb-4 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {ALL_AGENT_IDS.map((agentId) => {
          const isCurrent = isStreaming && lastActiveAgent === agentId;
          const isDone = seenAgents.has(agentId) && !isCurrent;
          return (
            <div
              key={agentId}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] transition",
                isCurrent
                  ? "border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-200"
                  : isDone
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400",
              )}
            >
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Bot
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isCurrent ? "animate-bounce text-indigo-600" : "text-slate-400",
                  )}
                />
              )}
              <span className="truncate font-medium">{AGENT_LABELS_HE[agentId]}</span>
            </div>
          );
        })}
      </div>

      {/* Live Timeline */}
      <div className="max-h-72 space-y-2 overflow-y-auto pe-1">
        <AnimatePresence initial={false}>
          {events.map((evt) => {
            const isWarning = evt.type === "warning_flag";
            const isError = evt.type === "error";
            const isFinal = evt.type === "final_report";

            return (
              <motion.div
                key={evt.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs",
                  isError
                    ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                    : isWarning
                      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      : isFinal
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    {isWarning ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    ) : isError ? (
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                    ) : (
                      <Bot className="h-3.5 w-3.5 text-indigo-500" />
                    )}
                    <span>{AGENT_LABELS_HE[evt.agent_id] || evt.agent_id}</span>
                  </span>

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {evt.tool_name && (
                      <span
                        dir="ltr"
                        className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {evt.tool_name}
                      </span>
                    )}
                    {typeof evt.latency_ms === "number" && (
                      <span dir="ltr" className="tabular-nums">
                        {Math.round(evt.latency_ms)} ms
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-1 leading-relaxed">{evt.message}</p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Error & Retry */}
      {error && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
        >
          <span className="font-medium">{error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>נסה שוב</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
