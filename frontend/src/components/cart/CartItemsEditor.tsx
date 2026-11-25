"use client";

import React, { useState } from "react";
import { Calculator, Plus, Sparkles, Trash2 } from "lucide-react";
import { cartSplitSchema } from "@/lib/schemas";
import type { CartItemInput, CartSplitRequest } from "@/types/api";

interface CartItemsEditorProps {
  onOptimize: (request: CartSplitRequest) => void;
  isSubmitting?: boolean;
}

interface CartPreset {
  id: string;
  label: string;
  badge: string;
  request: CartSplitRequest;
}

const PRESETS: CartPreset[] = [
  {
    id: "asos-sneakers",
    label: "סל ASOS: נייקי $58 + אדידס $64",
    badge: "חיסכון מקסימלי במע״מ",
    request: {
      store_name: "ASOS",
      shipping_per_package_usd: 10,
      free_shipping_threshold_usd: 49,
      ship_to_country: "IL",
      items: [
        {
          sku: "NIKE-DUNK-58",
          title: "Nike Dunk Low Retro",
          store_name: "ASOS",
          unit_price_usd: 58,
          quantity: 1,
        },
        {
          sku: "ADIDAS-SAMBA-64",
          title: "Adidas Samba OG",
          store_name: "ASOS",
          unit_price_usd: 64,
          quantity: 1,
        },
      ],
    },
  },
  {
    id: "amazon-tech",
    label: "סל אמזון: Anker $39 + Logitech $72 + UGREEN $34",
    badge: "3 פריטים חוצי רף $75",
    request: {
      store_name: "Amazon",
      shipping_per_package_usd: 12,
      free_shipping_threshold_usd: 49,
      ship_to_country: "IL",
      items: [
        {
          sku: "ANKER-GAN-39",
          title: "Anker 65W GaN Charger",
          store_name: "Amazon",
          unit_price_usd: 39,
          quantity: 1,
        },
        {
          sku: "LOGI-MX-72",
          title: "Logitech MX Keys Mini",
          store_name: "Amazon",
          unit_price_usd: 72,
          quantity: 1,
        },
        {
          sku: "UGREEN-HUB-34",
          title: "UGREEN USB-C 7-in-1 Hub",
          store_name: "Amazon",
          unit_price_usd: 34,
          quantity: 1,
        },
      ],
    },
  },
];

const STORES = ["ASOS", "Amazon", "AliExpress", "eBay", "KSP"];

export function CartItemsEditor({ onOptimize, isSubmitting = false }: CartItemsEditorProps) {
  const [storeName, setStoreName] = useState<string>(PRESETS[0].request.store_name);
  const [shipToCountry, setShipToCountry] = useState<string>(PRESETS[0].request.ship_to_country);
  const [shippingPerPackage, setShippingPerPackage] = useState<number>(
    PRESETS[0].request.shipping_per_package_usd,
  );
  const [freeThreshold, setFreeThreshold] = useState<string>(
    String(PRESETS[0].request.free_shipping_threshold_usd ?? ""),
  );
  const [items, setItems] = useState<CartItemInput[]>(PRESETS[0].request.items);
  const [validationError, setValidationError] = useState<string | null>(null);

  function applyPreset(preset: CartPreset, autoRun = true) {
    setStoreName(preset.request.store_name);
    setShipToCountry(preset.request.ship_to_country);
    setShippingPerPackage(preset.request.shipping_per_package_usd);
    setFreeThreshold(
      preset.request.free_shipping_threshold_usd != null
        ? String(preset.request.free_shipping_threshold_usd)
        : "",
    );
    setItems(preset.request.items.map((it) => ({ ...it })));
    setValidationError(null);
    if (autoRun) {
      onOptimize(preset.request);
    }
  }

  function handleStoreChange(nextStore: string) {
    setStoreName(nextStore);
    setItems((prev) => prev.map((it) => ({ ...it, store_name: nextStore })));
  }

  function updateItem(index: number, patch: Partial<CartItemInput>) {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  }

  function addItem() {
    const nextNum = items.length + 1;
    setItems((prev) => [
      ...prev,
      {
        sku: `ITEM-${nextNum}`,
        title: `מוצר ${nextNum}`,
        store_name: storeName,
        unit_price_usd: 35,
        quantity: 1,
      },
    ]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const parsedThreshold =
      freeThreshold.trim() === "" ? null : Number(freeThreshold.trim());

    const payload: CartSplitRequest = {
      store_name: storeName.trim(),
      ship_to_country: shipToCountry.trim().toUpperCase(),
      shipping_per_package_usd: Number(shippingPerPackage) || 0,
      free_shipping_threshold_usd:
        parsedThreshold !== null && !Number.isNaN(parsedThreshold)
          ? parsedThreshold
          : null,
      items: items.map((it) => ({
        ...it,
        sku: it.sku.trim(),
        title: it.title.trim(),
        store_name: (it.store_name || storeName).trim(),
        unit_price_usd: Number(it.unit_price_usd),
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      })),
    };

    const parsed = cartSplitSchema.safeParse(payload);
    if (!parsed.success) {
      const firstErr = parsed.error.errors[0]?.message || "נתוני הסל אינם תקינים";
      setValidationError(firstErr);
      return;
    }

    onOptimize(parsed.data);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {/* 1-click Presets */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
          <span>תרחישים מהירים לבדיקת פיצול מע״מ ($75)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset, true)}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-500/20 dark:text-indigo-300"
            >
              <span>{preset.label}</span>
              <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px]">
                {preset.badge}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Store & Shipping Settings */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="cart-store"
            className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            חנות מקור
          </label>
          <select
            id="cart-store"
            value={storeName}
            onChange={(e) => handleStoreChange(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
          >
            {STORES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="cart-country"
            className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            מדינת יעד
          </label>
          <select
            id="cart-country"
            value={shipToCountry}
            onChange={(e) => setShipToCountry(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="IL">IL — ישראל (פטור מע״מ עד $75)</option>
            <option value="US">US — ארה״ב</option>
            <option value="GB">GB — בריטניה</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="cart-shipping"
            className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            עלות משלוח לחבילה ($)
          </label>
          <input
            id="cart-shipping"
            type="number"
            min={0}
            step="0.5"
            dir="ltr"
            value={shippingPerPackage}
            onChange={(e) => setShippingPerPackage(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        <div>
          <label
            htmlFor="cart-free-threshold"
            className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            סף משלוח חינם ($) — אופציונלי
          </label>
          <input
            id="cart-free-threshold"
            type="number"
            min={0}
            step="1"
            dir="ltr"
            placeholder="למשל 49"
            value={freeThreshold}
            onChange={(e) => setFreeThreshold(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      {/* Items list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">פריטים בעגלה ({items.length})</h3>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>הוסף פריט</span>
          </button>
        </div>

        <div className="space-y-2.5">
          {items.map((item, idx) => (
            <div
              key={`${idx}-${item.sku}`}
              className="grid grid-cols-1 items-end gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="sm:col-span-3">
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  מק״ט (SKU)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={item.sku}
                  onChange={(e) => updateItem(idx, { sku: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  שם המוצר
                </label>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => updateItem(idx, { title: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  מחיר יחידה ($)
                </label>
                <input
                  type="number"
                  min={0.5}
                  step="0.5"
                  dir="ltr"
                  value={item.unit_price_usd}
                  onChange={(e) =>
                    updateItem(idx, { unit_price_usd: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  כמות
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  dir="ltr"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div className="flex justify-end sm:col-span-1">
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  disabled={items.length <= 2}
                  title={
                    items.length <= 2
                      ? "נדרשים לפחות 2 פריטים לבדיקת פיצול"
                      : "הסר פריט"
                  }
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {validationError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-500">
          {validationError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          <Calculator className="h-4 w-4" />
          <span>{isSubmitting ? "מחשב פיצול אופטימלי..." : "חשב אופטימיזציית פיצול סל"}</span>
        </button>
      </div>
    </form>
  );
}

export default CartItemsEditor;
