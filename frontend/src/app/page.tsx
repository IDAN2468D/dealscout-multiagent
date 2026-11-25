"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Cpu,
  Lock,
  ShieldAlert,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { AgentStreamLogs } from "@/components/search/AgentStreamLogs";
import { DealResultCard } from "@/components/search/DealResultCard";
import { OmniSearchBar } from "@/components/search/OmniSearchBar";
import { PriceHistoryDrawer } from "@/components/search/PriceHistoryDrawer";
import {
  SearchFilters,
  type SearchFilterValues,
} from "@/components/search/SearchFilters";
import { useDealStream } from "@/hooks/useDealStream";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";

export default function SearchWorkspacePage() {
  const user = useAuthStore((s) => s.user);
  const deals = useSearchStore((s) => s.deals);
  const blockedDeals = useSearchStore((s) => s.blockedDeals);
  const summary = useSearchStore((s) => s.summary);
  const telemetry = useSearchStore((s) => s.telemetry);
  const isStreaming = useSearchStore((s) => s.isStreaming);

  const {
    startTextSearch,
    startMultimodalMatch,
    cancelSearch,
    retryLastSearch,
  } = useDealStream();

  const [filters, setFilters] = useState<SearchFilterValues>({
    max_budget_ils: undefined,
    override_ship_to: user?.ship_to_country || "IL",
    preferred_stores: user?.preferred_stores || [],
    use_saved_profile: true,
  });

  const handleTextSearch = (query: string) => {
    void startTextSearch({
      query,
      max_budget_ils: filters.max_budget_ils,
      override_ship_to: filters.override_ship_to,
      use_saved_profile: filters.use_saved_profile,
    });
  };

  const displayedDeals = useMemo(() => {
    if (filters.preferred_stores.length === 0) return deals;
    const preferredSet = new Set(
      filters.preferred_stores.map((s) => s.toLowerCase()),
    );
    const matching = deals.filter((d) =>
      preferredSet.has(d.store_name.toLowerCase()),
    );
    const rest = deals.filter(
      (d) => !preferredSet.has(d.store_name.toLowerCase()),
    );
    return [...matching, ...rest];
  }, [deals, filters.preferred_stores]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Hero Banner */}
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200/70 bg-gradient-to-l from-indigo-50 via-white to-emerald-50/50 p-5 dark:border-indigo-900/50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-emerald-950/20 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>
              צוות 9 סוכני AI · <span dir="ltr">Gemini 3.5 Flash-Lite</span>
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            DealScout AI — סקירת עסקאות ומחיר סופי עד הבית
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            השוואת מחירים שקופה בש״ח כולל משלוח, קופוני מועדונים מאומתים, חישוב מע״מ{" "}
            <span dir="ltr">18%</span> מעל <span dir="ltr">$75</span>, וזיהוי מבצעים פיקטיביים.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-emerald-300">
            <TrendingDown className="h-4 w-4" />
            <span>חישוב עלות דטרמיניסטי</span>
          </span>
        </div>
      </header>

      {/* Unauthenticated Prompt */}
      {!user && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-100">
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span>
              התחבר לחשבון כדי להפעיל את סוכני החיפוש בזמן אמת, לשמור מועדוני אשראי ולקבל
              התראות ירידת מחיר.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              התחברות
            </Link>
            <Link
              href="/register"
              className="rounded-xl border border-indigo-300 bg-white px-4 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300"
            >
              הרשמה חינם
            </Link>
          </div>
        </div>
      )}

      {/* Search Bar & Filters */}
      <OmniSearchBar
        onTextSearch={handleTextSearch}
        onMultimodalMatch={(params) => void startMultimodalMatch(params)}
        onCancel={cancelSearch}
        isStreaming={isStreaming}
      />

      <SearchFilters value={filters} onChange={setFilters} />

      {/* Workspace Grid: SSE Stream + Results */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Live SSE Feed Column */}
        <div className="lg:col-span-5">
          <AgentStreamLogs onRetry={retryLastSearch} />
        </div>

        {/* Ranked Deals & Guardrails Column */}
        <div className="space-y-4 lg:col-span-7">
          {summary && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold">
                  <Bot className="h-4 w-4 text-emerald-600" />
                  <span>סיכום צוות הסוכנים</span>
                </span>
                {telemetry && (
                  <span
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <Cpu className="h-3 w-3 text-indigo-500" />
                    {telemetry.model_id} · {Math.round(telemetry.duration_ms)} ms ·{" "}
                    {telemetry.input_tokens + telemetry.output_tokens} tok
                  </span>
                )}
              </div>
              <p className="mt-1.5 leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Blocked Scams Summary Card */}
          {blockedDeals.length > 0 && (
            <section
              aria-label="הצעות שנחסמו מטעמי אבטחה"
              className="rounded-2xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-900/70 dark:bg-rose-950/40"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-rose-900 dark:text-rose-200">
                <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                <span>
                  נחסמו <span dir="ltr">{blockedDeals.length}</span> הצעות חשודות (
                  <span dir="ltr">BLOCKED_SCAM</span>)
                </span>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-rose-800 dark:text-rose-200">
                {blockedDeals.map((b, idx) => (
                  <li
                    key={`${String(b.product_id || idx)}-${String(b.seller_name || idx)}`}
                    className="rounded-lg border border-rose-200 bg-white/70 px-3 py-2 dark:border-rose-900/50 dark:bg-slate-900/60"
                  >
                    <span dir="ltr" className="font-bold">
                      {String(b.store_name || "")} · {String(b.seller_name || "Unknown")}
                    </span>{" "}
                    (אמינות{" "}
                    <span dir="ltr" className="font-semibold">
                      {String(b.seller_trust_score ?? 0)}/100
                    </span>
                    ): {String(b.reason || "נחסם על ידי מנגנון האבטחה")}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Ranked Deal Cards */}
          {displayedDeals.length > 0 ? (
            <div className="space-y-4">
              {displayedDeals.map((deal, idx) => (
                <DealResultCard
                  key={deal.deal_id}
                  deal={deal}
                  rank={idx + 1}
                />
              ))}
            </div>
          ) : !isStreaming && summary ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              לא נמצאו הצעות פעילות העומדות בתנאי הסינון והאבטחה.
            </div>
          ) : null}
        </div>
      </div>

      {/* Price History Recharts Drawer */}
      <PriceHistoryDrawer />
    </main>
  );
}
