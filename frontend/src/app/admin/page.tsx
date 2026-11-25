"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { GeminiCostChart } from "@/components/admin/GeminiCostChart";
import { ModerationTables } from "@/components/admin/ModerationTables";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { apiFetch } from "@/lib/apiClient";
import type { AdminModerationResponse, AdminTelemetryResponse } from "@/types/api";

function AdminDashboardContent() {
  const telemetryQuery = useQuery({
    queryKey: ["admin-telemetry"],
    queryFn: () => apiFetch<AdminTelemetryResponse>("/api/v1/admin/telemetry"),
  });

  const moderationQuery = useQuery({
    queryKey: ["admin-moderation"],
    queryFn: () => apiFetch<AdminModerationResponse>("/api/v1/admin/moderation"),
  });

  const isRefreshing = telemetryQuery.isFetching || moderationQuery.isFetching;
  const hasError = telemetryQuery.isError || moderationQuery.isError;

  const refreshAll = () => {
    telemetryQuery.refetch();
    moderationQuery.refetch();
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900 dark:text-slate-100">
            <ShieldCheck className="h-7 w-7 text-indigo-500" />
            <span>פאנל ניהול, טלמטריית Gemini ומודרציה</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            ניטור עלויות <span dir="ltr">gemini-3.5-flash-lite</span>, מטמון הקשר, OpenTelemetry וניהול קופונים ומוכרים חסומים.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>רענן נתונים</span>
        </button>
      </header>

      {hasError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>שגיאה בטעינת נתוני הניהול מהשרת.</span>
          </span>
          <button
            type="button"
            onClick={refreshAll}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
          >
            נסה שוב
          </button>
        </div>
      )}

      {telemetryQuery.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800/60"
              />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800/60" />
        </div>
      ) : telemetryQuery.data ? (
        <GeminiCostChart telemetry={telemetryQuery.data} />
      ) : null}

      {moderationQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800/60" />
          <div className="h-52 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800/60" />
        </div>
      ) : moderationQuery.data ? (
        <ModerationTables data={moderationQuery.data} />
      ) : null}
    </main>
  );
}

export default function AdminPage() {
  return (
    <AuthGuard requiredTier="ADMIN">
      <AdminDashboardContent />
    </AuthGuard>
  );
}
