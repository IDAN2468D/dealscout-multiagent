"use client";

import React from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { CartItemsEditor } from "@/components/cart/CartItemsEditor";
import { TaxSplitComparison } from "@/components/cart/TaxSplitComparison";
import { useCartOptimizer } from "@/hooks/useCartOptimizer";

export default function CartOptimizerPage() {
  const { mutate, data, isPending, error } = useCartOptimizer();

  return (
    <AuthGuard requiredTier="PRO">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-500">
              <ShieldCheck className="h-4 w-4" />
              <span>PRO • אלגוריתם דטרמיניסטי לפיצול חבילות $75</span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              אופטימיזציית סל ופיצול מע״מ (<span dir="ltr">$75</span>)
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              בדיקה מתמטית מדויקת: האם כדאי להזמין במשלוח מאוחד עם{" "}
              <span dir="ltr">18%</span> מע״מ או לפצל לחבילות פטורות ממס עד{" "}
              <span dir="ltr">$75</span> (כולל שקלול סף משלוח חינם).
            </p>
          </div>
        </div>

        <CartItemsEditor onOptimize={(req) => mutate(req)} isSubmitting={isPending} />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-500">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error.message || "שגיאה בחישוב פיצול הסל."}</span>
          </div>
        )}

        <TaxSplitComparison result={data} isLoading={isPending} />
      </div>
    </AuthGuard>
  );
}
