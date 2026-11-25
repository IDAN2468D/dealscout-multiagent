"use client";

import { Globe, SlidersHorizontal, Store, Wallet } from "lucide-react";
import { cn } from "@/lib/formatters";
import { useAuthStore } from "@/store/authStore";

export interface SearchFilterValues {
  max_budget_ils?: number;
  override_ship_to: string;
  preferred_stores: string[];
  use_saved_profile: boolean;
}

const STORE_OPTIONS = [
  "Amazon",
  "AliExpress",
  "ASOS",
  "eBay",
  "KSP",
  "Terminal X",
] as const;

const COUNTRY_OPTIONS = [
  { code: "IL", label: "ישראל (IL) · מע״מ מעל $75" },
  { code: "US", label: "ארה״ב (US)" },
  { code: "GB", label: "בריטניה (GB)" },
] as const;

interface SearchFiltersProps {
  value: SearchFilterValues;
  onChange: (next: SearchFilterValues) => void;
}

export function SearchFilters({ value, onChange }: SearchFiltersProps) {
  const user = useAuthStore((s) => s.user);

  const toggleStore = (store: string) => {
    const exists = value.preferred_stores.includes(store);
    const preferred_stores = exists
      ? value.preferred_stores.filter((s) => s !== store)
      : [...value.preferred_stores, store];
    onChange({ ...value, preferred_stores });
  };

  return (
    <section
      aria-label="סינון והגדרות חיפוש"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <SlidersHorizontal className="h-4 w-4 text-indigo-500" />
        <span>פילטרים מהירים וחישוב עלות משלוח</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Max Budget ILS */}
        <div>
          <label
            htmlFor="filter-max-budget"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <Wallet className="h-3.5 w-3.5 text-slate-400" />
            <span>תקציב מקסימלי בש״ח</span>
          </label>
          <input
            id="filter-max-budget"
            type="number"
            min={1}
            step="10"
            dir="ltr"
            value={value.max_budget_ils ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              const num = raw === "" ? undefined : Number(raw);
              onChange({
                ...value,
                max_budget_ils: num && Number.isFinite(num) && num > 0 ? num : undefined,
              });
            }}
            placeholder="ללא הגבלה (למשל 1200)"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        {/* Ship To Country */}
        <div>
          <label
            htmlFor="filter-ship-to"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <Globe className="h-3.5 w-3.5 text-slate-400" />
            <span>מדינת יעד למשלוח</span>
          </label>
          <select
            id="filter-ship-to"
            value={value.override_ship_to}
            onChange={(e) => onChange({ ...value, override_ship_to: e.target.value })}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {COUNTRY_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Use Saved Profile Switch */}
        <div className="flex items-end">
          <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-950">
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                השתמש בפרופיל מועדונים שמור
              </span>
              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                {user?.credit_card_clubs?.length
                  ? `${user.credit_card_clubs.length} מועדונים פעילים (${user.credit_card_clubs.join(", ")})`
                  : "הייטקזון / חבר / FlyCard / Max"}
              </span>
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-checked={value.use_saved_profile}
              checked={value.use_saved_profile}
              onChange={(e) =>
                onChange({ ...value, use_saved_profile: e.target.checked })
              }
              className="h-4 w-4 accent-indigo-600"
            />
          </label>
        </div>
      </div>

      {/* Preferred Stores Chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          <Store className="h-3.5 w-3.5" />
          <span>חנויות מועדפות:</span>
        </span>
        {STORE_OPTIONS.map((store) => {
          const active = value.preferred_stores.includes(store);
          return (
            <button
              key={store}
              type="button"
              aria-pressed={active}
              onClick={() => toggleStore(store)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                active
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              <span dir="ltr">{store}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
