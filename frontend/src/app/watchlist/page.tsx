"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bell,
  BellRing,
  Plus,
  Radio,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn, formatDateHe, formatILS, formatUSD } from "@/lib/formatters";
import { useAuthStore } from "@/store/authStore";
import type { WatchlistItem } from "@/types/api";

export default function WatchlistPage() {
  const user = useAuthStore((s) => s.user);
  const {
    items,
    isLoading,
    error,
    alerts,
    alertsLoading,
    addWatchlist,
    removeWatchlist,
    triggerKafkaPriceDrop,
  } = useWatchlist();

  const [productTitle, setProductTitle] = useState("Sony WH-1000XM5 Wireless Headphones");
  const [sku, setSku] = useState("WH1000XM5-BLK");
  const [storeName, setStoreName] = useState("Amazon");
  const [targetIls, setTargetIls] = useState("990");
  const [formError, setFormError] = useState<string | null>(null);
  const [kafkaNotice, setKafkaNotice] = useState<string | null>(null);

  const tier = (user?.tier || "FREE").toUpperCase();
  const maxLimit = tier === "ADMIN" ? null : tier === "PRO" ? 50 : 3;
  const atLimit = maxLimit !== null && items.length >= maxLimit;
  const quotaPct = useMemo(() => {
    if (maxLimit === null) return 15;
    return Math.min(100, Math.round((items.length / maxLimit) * 100));
  }, [items.length, maxLimit]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!productTitle.trim() || !sku.trim()) {
      setFormError("יש להזין שם מוצר ומק״ט.");
      return;
    }

    const ilsVal = Number(targetIls);
    if (!ilsVal || ilsVal <= 0) {
      setFormError("יש להזין מחיר יעד חיובי בש״ח.");
      return;
    }

    const usdVal = Number((ilsVal / 3.65).toFixed(2));
    addWatchlist.mutate(
      {
        product_id: sku.trim().toLowerCase(),
        sku: sku.trim(),
        product_title: productTitle.trim(),
        store_name: storeName.trim() || null,
        target_price_ils: ilsVal,
        target_price_usd: usdVal,
      },
      {
        onError: (err) => {
          setFormError(err.message || "לא ניתן להוסיף פריט למעקב.");
        },
      },
    );
  }

  function handleSimulateKafkaDrop(targetItem?: WatchlistItem) {
    setKafkaNotice(null);
    const chosen = targetItem || items[0];
    if (!chosen) {
      setKafkaNotice("הוסף לפחות מוצר אחד למעקב כדי להדגים ירידת מחיר ב-Kafka.");
      return;
    }

    const thresholdUsd =
      chosen.target_price_usd ??
      (chosen.target_price_ils ? Number((chosen.target_price_ils / 3.65).toFixed(2)) : 120);
    const droppedPriceUsd = Math.max(1, Number((thresholdUsd * 0.85).toFixed(2)));

    triggerKafkaPriceDrop.mutate(
      {
        product_id: chosen.product_id,
        sku: chosen.sku,
        store_name: chosen.store_name || "Amazon",
        new_price_usd: droppedPriceUsd,
      },
      {
        onSuccess: (res) => {
          setKafkaNotice(
            `אירוע Kafka נשלח (${res.store_name} — $${res.new_price_usd.toFixed(2)}). שוגרו ${res.user_alerts.length} התראות לחשבון שלך!`,
          );
        },
        onError: (err) => {
          setKafkaNotice(`שגיאה בהדמיית Kafka: ${err.message}`);
        },
      },
    );
  }

  return (
    <AuthGuard>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Top Header + Quota Meter */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-bold text-indigo-500">
              <Radio className="h-3.5 w-3.5" />
              <span>Kafka Price-Drop Watcher</span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              מעקב מחירים והתראות ירידת מחיר
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              עקוב אחרי מוצרים וקבל התראה מיידית ברגע שהמחיר יורד מתחת למחיר היעד שלך.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Quota Meter */}
            <div className="min-w-52 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-500 dark:text-slate-400">מכסת מעקב ({tier})</span>
                <span dir="ltr" className="tabular-nums">
                  {maxLimit === null ? `${items.length} / ∞` : `${items.length} / ${maxLimit}`}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    atLimit ? "bg-rose-500" : quotaPct >= 80 ? "bg-amber-500" : "bg-emerald-500",
                  )}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
            </div>

            {/* 1-click Kafka Demo Button */}
            <button
              type="button"
              onClick={() => handleSimulateKafkaDrop()}
              disabled={triggerKafkaPriceDrop.isPending || items.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              <span>
                {triggerKafkaPriceDrop.isPending
                  ? "משדר ל-Kafka..."
                  : "הדמיית ירידת מחיר ב-Kafka"}
              </span>
            </button>
          </div>
        </div>

        {kafkaNotice && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <BellRing className="h-4 w-4 shrink-0" />
            <span>{kafkaNotice}</span>
          </div>
        )}

        {atLimit && tier === "FREE" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-300">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>
                הגעת למגבלת מסלול FREE (<span dir="ltr">3</span> מוצרים). שדרג ל-PRO לעד{" "}
                <span dir="ltr">50</span> מוצרים והתראות Telegram/Slack.
              </span>
            </div>
            <Link
              href="/profile"
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
            >
              ניהול ערוצי התראה
            </Link>
          </div>
        )}

        {/* Quick Add Form */}
        <form
          onSubmit={handleAdd}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="mb-3 text-base font-bold">הוספת מוצר מהירה למעקב</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <label
                htmlFor="wl-title"
                className="mb-1 block text-xs font-semibold text-slate-500"
              >
                שם המוצר
              </label>
              <input
                id="wl-title"
                type="text"
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="wl-sku"
                className="mb-1 block text-xs font-semibold text-slate-500"
              >
                מק״ט (SKU)
              </label>
              <input
                id="wl-sku"
                type="text"
                dir="ltr"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="wl-store"
                className="mb-1 block text-xs font-semibold text-slate-500"
              >
                חנות
              </label>
              <select
                id="wl-store"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="Amazon">Amazon</option>
                <option value="ASOS">ASOS</option>
                <option value="AliExpress">AliExpress</option>
                <option value="eBay">eBay</option>
                <option value="KSP">KSP</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="wl-target-ils"
                className="mb-1 block text-xs font-semibold text-slate-500"
              >
                מחיר יעד (₪)
              </label>
              <input
                id="wl-target-ils"
                type="number"
                min={1}
                step="1"
                dir="ltr"
                value={targetIls}
                onChange={(e) => setTargetIls(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="flex items-end sm:col-span-1">
              <button
                type="submit"
                disabled={addWatchlist.isPending || atLimit}
                className="inline-flex w-full items-center justify-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                title="הוסף למעקב"
              >
                <Plus className="h-4 w-4" />
                <span className="sm:hidden">הוסף</span>
              </button>
            </div>
          </div>

          {formError && (
            <p className="mt-2 text-xs font-semibold text-rose-500">{formError}</p>
          )}
        </form>

        {/* Active Watchlist + Kafka Alerts Split */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Watchlist Items */}
          <div className="space-y-3 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Bell className="h-5 w-5 text-indigo-500" />
                <span>מוצרים במעקב פעיל ({items.length})</span>
              </h2>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((k) => (
                  <div
                    key={k}
                    className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-500">
                {error.message || "שגיאה בטעינת רשימת המעקב."}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  עדיין אין מוצרים במעקב המחירים שלך.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  השתמש בטופס למעלה כדי להוסיף מוצר או הוסף ישירות מתוצאות החיפוש.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{item.product_title}</span>
                        {item.store_name && (
                          <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-500">
                            {item.store_name}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          מק״ט: <span dir="ltr" className="font-mono">{item.sku}</span>
                        </span>
                        {item.target_price_ils != null && (
                          <span>
                            יעד:{" "}
                            <span dir="ltr" className="font-bold tabular-nums text-emerald-500">
                              {formatILS(item.target_price_ils)}
                            </span>
                          </span>
                        )}
                        {item.target_price_usd != null && (
                          <span dir="ltr" className="tabular-nums">
                            ({formatUSD(item.target_price_usd)})
                          </span>
                        )}
                        {item.last_seen_price_usd != null && (
                          <span>
                            מחיר אחרון:{" "}
                            <span dir="ltr" className="font-semibold tabular-nums text-amber-500">
                              {formatUSD(item.last_seen_price_usd)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSimulateKafkaDrop(item)}
                        disabled={triggerKafkaPriceDrop.isPending}
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 transition hover:bg-amber-500/20 dark:text-amber-400"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        <span>הדמיית ירידה</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => removeWatchlist.mutate(item.id)}
                        disabled={removeWatchlist.isPending}
                        aria-label={`הסר את ${item.product_title}`}
                        className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-time Kafka Price-Drop Alerts Log */}
          <div className="space-y-3 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Activity className="h-5 w-5 text-emerald-500" />
                <span>יומן התראות Kafka (חי)</span>
              </h2>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-500">
                <span dir="ltr">deal-alerts</span>
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {alertsLoading ? (
                <div className="space-y-2.5">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"
                    />
                  ))}
                </div>
              ) : alerts.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  טרם התקבלו התראות ירידת מחיר. לחץ על &quot;הדמיית ירידת מחיר ב-Kafka&quot; לבדיקה מיידית.
                </div>
              ) : (
                <div className="max-h-[480px] space-y-2.5 overflow-y-auto pe-1">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {alert.store_name || "Store"} •{" "}
                          <span dir="ltr" className="font-mono text-indigo-400">
                            {alert.product_id}
                          </span>
                        </span>
                        <span dir="ltr" className="font-extrabold tabular-nums text-emerald-500">
                          {formatILS(alert.new_price_ils)} ({formatUSD(alert.new_price_usd)})
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <div className="flex flex-wrap gap-1">
                          {alert.channels.map((ch) => (
                            <span
                              key={ch}
                              dir="ltr"
                              className="rounded-md bg-slate-900/10 px-1.5 py-0.5 font-medium dark:bg-white/10"
                            >
                              {ch}
                            </span>
                          ))}
                        </div>
                        <span>{formatDateHe(alert.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
