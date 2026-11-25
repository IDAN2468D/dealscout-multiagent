"use client";

import React from "react";
import Link from "next/link";
import {
  Bell,
  Camera,
  Check,
  Crown,
  Infinity as InfinityIcon,
  ShoppingCart,
  Sparkles,
} from "lucide-react";

interface UpgradeTierBannerProps {
  featureName?: string;
  description?: string;
}

const PRO_BENEFITS = [
  {
    icon: InfinityIcon,
    text: "חיפושי דילים ללא הגבלה (לעומת 10 חיפושים ביום ב-FREE)",
  },
  {
    icon: Bell,
    text: "מעקב אחר עד 50 מוצרים ב-Watchlist + התראות Telegram ו-Slack",
  },
  {
    icon: Camera,
    text: "חיפוש מולטי-מודאלי מתמונה או קישור URL (Gemini 3.5 Flash-Lite Vision)",
  },
  {
    icon: ShoppingCart,
    text: "אופטימיזציית פיצול סל אוטומטית (רף $75 לפטור מ-18% מע״מ)",
  },
];

export function UpgradeTierBanner({
  featureName = "פיצ׳ר זה זמין למנויי PRO",
  description = "שדרג למסלול DealScout PRO כדי ליהנות ממלוא כוח סוכני ה-AI, פיצול חבילות לחיסכון במע״מ והתראות זמן אמת.",
}: UpgradeTierBannerProps) {
  return (
    <section
      aria-label="שדרוג למסלול PRO"
      className="mx-auto my-6 max-w-3xl overflow-hidden rounded-2xl border border-indigo-500/30 bg-[var(--bg-card)] shadow-xl"
    >
      <div className="bg-gradient-to-l from-indigo-600/20 via-indigo-500/10 to-emerald-500/10 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/25">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">
                <Sparkles className="h-3 w-3" />
                מסלול PRO נדרש
              </span>
              <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">
                {featureName}
              </h2>
            </div>
          </div>

          <span
            dir="ltr"
            className="tabular-nums rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-bold text-emerald-400"
          >
            PRO Tier
          </span>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {PRO_BENEFITS.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.text}
                className="flex items-start gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-3 text-sm text-[var(--text-primary)]"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="flex items-start gap-1.5 leading-snug">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                  <span>{item.text}</span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-5">
          <p className="text-xs text-[var(--text-muted)]">
            טיפ: חשבון PRO מאפשר חישובי פיצול $75 ומעקב Telegram מיידי.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)]"
            >
              חזרה לחיפוש מבצעים
            </Link>
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500"
            >
              <Crown className="h-4 w-4" />
              צפה בפרטי המנוי והפרופיל
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default UpgradeTierBanner;
