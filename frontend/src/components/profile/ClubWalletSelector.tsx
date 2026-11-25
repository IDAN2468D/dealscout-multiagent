"use client";

import { Check, CreditCard, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/formatters";

export interface ClubOption {
  id: string;
  labelHe: string;
  badgeCode: string;
  benefitHe: string;
}

export const ISRAELI_CLUB_OPTIONS: ClubOption[] = [
  {
    id: "HitechZone",
    labelHe: "הייטקזון",
    badgeCode: "HTZ12",
    benefitHe: "עד 12% הנחה באמזון, KSP ורשתות אלקטרוניקה",
  },
  {
    id: "Hever",
    labelHe: "חבר",
    badgeCode: "HEVER15",
    benefitHe: "עד 15% הנחה ושוברים ב-KSP, Terminal X ו-ASOS",
  },
  {
    id: "FlyCard",
    labelHe: "פליי קארד",
    badgeCode: "FLYCARD10",
    benefitHe: "10% הנחה וצבירת נקודות אל על באמזון ו-eBay",
  },
  {
    id: "Max",
    labelHe: "מקס",
    badgeCode: "MAX8",
    benefitHe: "8% הנחה מיידית בעליאקספרס, ASOS ואמזון",
  },
  {
    id: "Cal",
    labelHe: "כאל",
    badgeCode: "CAL",
    benefitHe: "הטבות מועדון כאל ופינוקים בקניות אונליין",
  },
  {
    id: "Amex",
    labelHe: "אמריקן אקספרס",
    badgeCode: "AMEX",
    benefitHe: "מבצעי Amex Global והחזרי עסקאות מט״ח",
  },
  {
    id: "Isracard",
    labelHe: "ישראכרט",
    badgeCode: "ISRA10",
    benefitHe: "10% קאשבק ב-KSP, Terminal X וקניות אונליין",
  },
];

interface ClubWalletSelectorProps {
  selectedClubs: string[];
  onChange: (clubs: string[]) => void;
  disabled?: boolean;
  error?: string;
}

export function ClubWalletSelector({
  selectedClubs,
  onChange,
  disabled = false,
  error,
}: ClubWalletSelectorProps) {
  const toggleClub = (clubId: string) => {
    if (disabled) return;
    const exists = selectedClubs.includes(clubId);
    if (exists) {
      onChange(selectedClubs.filter((c) => c !== clubId));
    } else {
      onChange([...selectedClubs, clubId]);
    }
  };

  return (
    <section
      aria-labelledby="club-wallet-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="club-wallet-heading"
            className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            <CreditCard className="h-5 w-5 text-indigo-500" />
            <span>ארנק מועדוני צרכנות וכרטיסי אשראי</span>
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            בחר את המועדונים שלך כדי שסוכן הקופונים יתאים הנחות מועדון אוטומטית בכל חיפוש.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
          נבחרו:
          <span dir="ltr" className="font-semibold tabular-nums">
            {selectedClubs.length}/{ISRAELI_CLUB_OPTIONS.length}
          </span>
        </span>
      </div>

      <div
        role="note"
        className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-300"
      >
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>שמות מועדונים בלבד — לעולם אין להזין מספרי כרטיס אשראי.</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ISRAELI_CLUB_OPTIONS.map((club) => {
          const isSelected = selectedClubs.includes(club.id);
          return (
            <button
              key={club.id}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => toggleClub(club.id)}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl border p-4 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60",
                isSelected
                  ? "border-indigo-500 bg-indigo-500/10 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/15"
                  : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60",
              )}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {club.labelHe}
                    </span>
                    <span
                      dir="ltr"
                      className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {club.id}
                    </span>
                  </div>
                </div>

                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isSelected
                      ? "border-indigo-500 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500"
                      : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900",
                  )}
                >
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </span>
              </div>

              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {club.benefitHe}
              </p>

              <div className="mt-3 flex items-center justify-between border-t border-slate-200/70 pt-2 text-[11px] dark:border-slate-800/80">
                <span className="text-slate-500 dark:text-slate-400">קוד מועדון מוביל</span>
                <span
                  dir="ltr"
                  className="font-mono font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  {club.badgeCode}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </section>
  );
}
