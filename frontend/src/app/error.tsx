"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("DealScout global error boundary:", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto my-14 max-w-lg rounded-2xl border border-rose-500/30 bg-[var(--bg-card)] p-8 text-center shadow-xl"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
        אירעה שגיאה בלתי צפויה
      </h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        {error.message || "לא ניתן היה להשלים את טעינת המסך כרגע."}
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          מזהה תקלה: <span dir="ltr">{error.digest}</span>
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          <RefreshCw className="h-4 w-4" />
          נסה שוב
        </button>
        <Link
          href="/"
          className="rounded-xl border border-[var(--border-subtle)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)]"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
