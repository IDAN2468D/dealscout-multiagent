"use client";

import { Bell, Brain, Globe, Shield, Store, Truck } from "lucide-react";
import { cn } from "@/lib/formatters";
import type { NotificationChannel, UserRole } from "@/types/api";

export interface MemoryPreferencesValues {
  preferred_currency: "ILS" | "USD" | "EUR";
  ship_to_country: string;
  min_seller_trust: number;
  official_warranty_only: boolean;
  max_delivery_days: number;
  notification_channels: NotificationChannel[];
  telegram_chat_id: string;
  preferred_stores: string[];
}

interface MemoryPreferencesFormProps {
  values: MemoryPreferencesValues;
  userTier?: UserRole;
  disabled?: boolean;
  errors?: Partial<Record<string, string>>;
  onChange: (patch: Partial<MemoryPreferencesValues>) => void;
}

const CURRENCIES: Array<{ value: "ILS" | "USD" | "EUR"; label: string; symbol: string }> = [
  { value: "ILS", label: "שקל חדש", symbol: "₪ ILS" },
  { value: "USD", label: "דולר אמריקאי", symbol: "$ USD" },
  { value: "EUR", label: "אירו", symbol: "€ EUR" },
];

const COUNTRIES: Array<{ code: string; labelHe: string; noteHe: string }> = [
  { code: "IL", labelHe: "ישראל", noteHe: "פטור מע״מ עד $75" },
  { code: "US", labelHe: "ארה״ב", noteHe: "משלוח מקומי / מאוחד" },
  { code: "GB", labelHe: "בריטניה", noteHe: "שקע UK / אירופה" },
];

const CHANNELS: Array<{
  id: NotificationChannel;
  labelHe: string;
  proOnly?: boolean;
}> = [
  { id: "email", labelHe: "דוא״ל (Email)" },
  { id: "telegram", labelHe: "טלגרם (Telegram)", proOnly: true },
  { id: "slack", labelHe: "סלאק (Slack)", proOnly: true },
];

const STORE_OPTIONS = ["Amazon", "AliExpress", "ASOS", "eBay", "KSP", "Terminal X"];

export function MemoryPreferencesForm({
  values,
  userTier = "FREE",
  disabled = false,
  errors = {},
  onChange,
}: MemoryPreferencesFormProps) {
  const toggleChannel = (channel: NotificationChannel) => {
    if (disabled) return;
    const exists = values.notification_channels.includes(channel);
    if (exists) {
      if (values.notification_channels.length <= 1) return;
      onChange({
        notification_channels: values.notification_channels.filter((c) => c !== channel),
      });
    } else {
      onChange({
        notification_channels: [...values.notification_channels, channel],
      });
    }
  };

  const toggleStore = (store: string) => {
    if (disabled) return;
    const exists = values.preferred_stores.includes(store);
    onChange({
      preferred_stores: exists
        ? values.preferred_stores.filter((s) => s !== store)
        : [...values.preferred_stores, store],
    });
  };

  return (
    <section
      aria-labelledby="memory-prefs-heading"
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
    >
      <div>
        <h2
          id="memory-prefs-heading"
          className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          <Brain className="h-5 w-5 text-indigo-500" />
          <span>העדפות קונה וזיכרון סוכן ארוך-טווח</span>
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          העדפות אלו נשמרות בזיכרון הסוכן האישי שלך ונאכפות אוטומטית בחישוב עלות, סינון מוכרים והתראות.
        </p>
      </div>

      {/* Currency & Ship-to country */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
            <Globe className="h-4 w-4 text-indigo-500" />
            <span>מטבע תצוגה מועדף</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CURRENCIES.map((cur) => {
              const active = values.preferred_currency === cur.value;
              return (
                <button
                  key={cur.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => onChange({ preferred_currency: cur.value })}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                    active
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-200"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  <div dir="ltr" className="text-sm font-semibold">
                    {cur.symbol}
                  </div>
                  <div className="mt-0.5 text-[11px] opacity-80">{cur.label}</div>
                </button>
              );
            })}
          </div>
          {errors.preferred_currency && (
            <p className="mt-1.5 text-xs text-rose-500">{errors.preferred_currency}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="ship-to-country"
            className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            <Globe className="h-4 w-4 text-emerald-500" />
            <span>ארץ יעד למשלוח</span>
          </label>
          <select
            id="ship-to-country"
            disabled={disabled}
            value={values.ship_to_country}
            onChange={(e) => onChange({ ship_to_country: e.target.value })}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.labelHe} ({c.code}) — {c.noteHe}
              </option>
            ))}
          </select>
          {errors.ship_to_country && (
            <p className="mt-1.5 text-xs text-rose-500">{errors.ship_to_country}</p>
          )}
        </div>
      </div>

      {/* Min seller trust slider & Max delivery days */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="min-seller-trust"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              <Shield className="h-4 w-4 text-emerald-500" />
              <span>סף אמינות מוכר מינימלי</span>
            </label>
            <span
              dir="ltr"
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
                values.min_seller_trust >= 80
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : values.min_seller_trust >= 70
                    ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              {values.min_seller_trust} / 100
            </span>
          </div>
          <input
            id="min-seller-trust"
            type="range"
            min={50}
            max={100}
            step={1}
            disabled={disabled}
            value={values.min_seller_trust}
            onChange={(e) => onChange({ min_seller_trust: Number(e.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-indigo-600 dark:bg-slate-800"
          />
          <div className="mt-1.5 flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span dir="ltr">50</span>
            <span>מוכרים מתחת ל-70 נחסמים ע״י Guardrails</span>
            <span dir="ltr">100</span>
          </div>
          {errors.min_seller_trust && (
            <p className="mt-1.5 text-xs text-rose-500">{errors.min_seller_trust}</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
          <label
            htmlFor="max-delivery-days"
            className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            <Truck className="h-4 w-4 text-indigo-500" />
            <span>זמן משלוח מקסימלי (ימים)</span>
          </label>
          <input
            id="max-delivery-days"
            type="number"
            min={1}
            max={60}
            dir="ltr"
            disabled={disabled}
            value={values.max_delivery_days}
            onChange={(e) =>
              onChange({
                max_delivery_days: Math.max(1, Math.min(60, Number(e.target.value) || 1)),
              })
            }
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            טווח מותר: 1 עד 60 ימי עסקים.
          </p>
          {errors.max_delivery_days && (
            <p className="mt-1.5 text-xs text-rose-500">{errors.max_delivery_days}</p>
          )}
        </div>
      </div>

      {/* Official Warranty Toggle */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            אחריות יבואן רשמי ותאימות מלאה לישראל (230V) בלבד
          </div>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            כאשר פעיל, הסוכן יתעדף חנויות עם אחריות רשמית ויתריע ביתר שאת על מוצרי 110V.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={values.official_warranty_only}
          aria-label="אחריות יבואן רשמי בלבד"
          disabled={disabled}
          onClick={() => onChange({ official_warranty_only: !values.official_warranty_only })}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
            values.official_warranty_only ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
              values.official_warranty_only ? "-translate-x-6" : "-translate-x-1",
            )}
          />
        </button>
      </div>

      {/* Preferred stores */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
          <Store className="h-4 w-4 text-indigo-500" />
          <span>חנויות מועדפות</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {STORE_OPTIONS.map((store) => {
            const active = values.preferred_stores.includes(store);
            return (
              <button
                key={store}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => toggleStore(store)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800",
                )}
              >
                <span dir="ltr">{store}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notification Channels + Telegram Chat ID */}
      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
            <Bell className="h-4 w-4 text-indigo-500" />
            <span>ערוצי התראות ירידת מחיר</span>
          </label>
          {userTier === "FREE" && (
            <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              Telegram / Slack זמינים במסלול PRO
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5">
          {CHANNELS.map((ch) => {
            const active = values.notification_channels.includes(ch.id);
            return (
              <button
                key={ch.id}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => toggleChannel(ch.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all",
                  active
                    ? "border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:border-indigo-400 dark:text-indigo-200"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                <span>{ch.labelHe}</span>
                {ch.proOnly && (
                  <span
                    dir="ltr"
                    className="rounded bg-indigo-600/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-300"
                  >
                    PRO
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {errors.notification_channels && (
          <p className="text-xs text-rose-500">{errors.notification_channels}</p>
        )}

        <div>
          <label
            htmlFor="telegram-chat-id"
            className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400"
          >
            מזהה צ׳אט טלגרם (<span dir="ltr">Telegram Chat ID</span>)
          </label>
          <input
            id="telegram-chat-id"
            type="text"
            dir="ltr"
            disabled={disabled}
            placeholder="e.g. 123456789"
            value={values.telegram_chat_id}
            onChange={(e) => onChange({ telegram_chat_id: e.target.value })}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          {errors.telegram_chat_id && (
            <p className="mt-1 text-xs text-rose-500">{errors.telegram_chat_id}</p>
          )}
        </div>
      </div>
    </section>
  );
}
