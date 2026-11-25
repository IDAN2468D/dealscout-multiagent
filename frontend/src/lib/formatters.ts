import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AgentId, DiscountVerdict } from "@/types/api";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatILS(amount: number): string {
  return `₪${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatUSD(amount: number): string {
  return `$${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateHe(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const AGENT_LABELS_HE: Record<AgentId, string> = {
  "deal-orchestrator-agent": "סוכן מתזמר ראשי (Gemini 3.5 Flash-Lite)",
  "multimodal-product-matcher": "מזהה מוצר מולטי-מודאלי (Vision / URL)",
  "store-search-mcp-agent": "סוכן חיפוש חנויות (Elasticsearch + MCP)",
  "coupon-hunter-rag-agent": "צייד קופונים ומועדונים (RAG + Cache)",
  "price-history-auditor": "מבקר היסטוריית מחירים",
  "review-compatibility-auditor": "מבקר ביקורות ותאימות 110V",
  "landed-cost-calculator": "מחשבון עלות סופית ומע״מ (Python דטרמיניסטי)",
  "smart-cart-tax-optimizer": "אופטימיזציית פיצול סל $75",
  "trust-guardrails-hitl-agent": "שומר אבטחה ו-HITL",
};

export const VERDICT_META_HE: Record<
  DiscountVerdict,
  { label: string; tone: "emerald" | "slate" | "rose" | "amber" }
> = {
  GREAT_DEAL: { label: "עסקה משתלמת במיוחד", tone: "emerald" },
  FAIR_PRICE: { label: "מחיר הוגן", tone: "slate" },
  FAKE_DISCOUNT: { label: "הנחה פיקטיבית (זינוק מחיר)", tone: "rose" },
  INCOMPATIBLE_SPEC: { label: "אזהרת תאימות (110V / מפרט)", tone: "amber" },
  BLOCKED_SCAM: { label: "נחסם מטעמי אבטחה", tone: "rose" },
};
