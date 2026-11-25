"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Lock, LogIn, ShieldAlert } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { UpgradeTierBanner } from "@/components/layout/UpgradeTierBanner";
import type { UserRole } from "@/types/api";

interface AuthGuardProps {
  requiredTier?: UserRole;
  children: React.ReactNode;
}

const TIER_RANK: Record<UserRole, number> = {
  FREE: 0,
  PRO: 1,
  ADMIN: 2,
};

export function AuthGuard({ requiredTier = "FREE", children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  useEffect(() => {
    if (isInitialized && !user && pathname && !pathname.startsWith("/login")) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isInitialized, user, pathname, router]);

  if (!isInitialized) {
    return (
      <div
        aria-busy="true"
        aria-label="טוען הרשאות משתמש"
        className="mx-auto my-8 max-w-4xl space-y-4"
      >
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
        <div className="h-36 w-full animate-pulse rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-28 animate-pulse rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]" />
          <div className="h-28 animate-pulse rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto my-12 max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 text-center shadow-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
          נדרשת התחברות לחשבון
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          כדי לגשת לאזור זה יש להתחבר עם חשבון DealScout AI שלך.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href={`/login${pathname ? `?next=${encodeURIComponent(pathname)}` : ""}`}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            <LogIn className="h-4 w-4" />
            מעבר להתחברות
          </Link>
        </div>
      </div>
    );
  }

  const currentTier: UserRole = (user.tier || user.role || "FREE") as UserRole;
  if (TIER_RANK[currentTier] < TIER_RANK[requiredTier]) {
    if (requiredTier === "PRO") {
      return (
        <UpgradeTierBanner
          featureName="אופטימיזציית פיצול סל ופיצ׳רים מתקדמים (PRO)"
          description="עמוד זה פתוח למנויי PRO ומעלה. שדרג את המסלול שלך כדי לחשב פיצול חבילות מתחת לרף $75 ולקבל התראות מיידיות."
        />
      );
    }

    return (
      <div
        role="alert"
        className="mx-auto my-12 max-w-lg rounded-2xl border border-rose-500/30 bg-[var(--bg-card)] p-8 text-center shadow-lg"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="mt-3 inline-block rounded-full bg-rose-500/15 px-3 py-0.5 text-xs font-bold text-rose-400">
          <span dir="ltr">403 Forbidden</span>
        </div>
        <h2 className="mt-3 text-xl font-bold text-[var(--text-primary)]">
          אין הרשאת גישה למסך ניהול מערכת
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          אזור זה מוגבל למנהלי מערכת (<span dir="ltr">ADMIN</span>) בלבד.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default AuthGuard;
