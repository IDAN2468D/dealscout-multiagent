"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ImagePlus,
  Link2,
  Lock,
  Search,
  Sparkles,
  Square,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/formatters";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";
import type { MultimodalMatchParams } from "@/hooks/useDealStream";

type SearchTab = "text" | "url" | "image";

const DEMO_PRESETS = [
  "Sony WH-1000XM5",
  "Ninja Creami 110V",
  "Samsung T7 Shield 2TB",
  "Apple AirPods Pro 2",
] as const;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface OmniSearchBarProps {
  onTextSearch: (query: string) => void;
  onMultimodalMatch: (params: MultimodalMatchParams) => void;
  onCancel?: () => void;
  isStreaming?: boolean;
}

export function OmniSearchBar({
  onTextSearch,
  onMultimodalMatch,
  onCancel,
  isStreaming = false,
}: OmniSearchBarProps) {
  const user = useAuthStore((s) => s.user);
  const storeQuery = useSearchStore((s) => s.query);
  const setStoreQuery = useSearchStore((s) => s.setQuery);

  const [activeTab, setActiveTab] = useState<SearchTab>("text");
  const [textInput, setTextInput] = useState(storeQuery || "");
  const [urlInput, setUrlInput] = useState("");
  const [hintText, setHintText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isProLocked = user?.tier === "FREE";

  useEffect(() => {
    if (storeQuery && storeQuery !== textInput && activeTab === "text") {
      setTextInput(storeQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeQuery]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const handleFileSelection = (file: File | null | undefined) => {
    setLocalError(null);
    if (!file) return;

    const lower = file.name.toLowerCase();
    const validExt =
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".webp");

    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      setLocalError("יש לבחור קובץ תמונה בפורמט JPG, PNG או WebP בלבד.");
      return;
    }
    if (!file.type && !validExt) {
      setLocalError("יש לבחור קובץ תמונה בפורמט JPG, PNG או WebP בלבד.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setLocalError("גודל התמונה המקסימלי הוא 5MB.");
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const trimmed = textInput.trim();
    if (trimmed.length < 2) {
      setLocalError("הזן לפחות 2 תווים לחיפוש.");
      return;
    }
    setStoreQuery(trimmed);
    onTextSearch(trimmed);
  };

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (isProLocked) {
      setLocalError("זיהוי אוטומטי מקישור פתוח למשתמשי PRO ומעלה.");
      return;
    }
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) {
      setLocalError("יש להדביק כתובת קישור למוצר (URL).");
      return;
    }
    onMultimodalMatch({
      product_url: trimmedUrl,
      hint_text: hintText.trim() || undefined,
    });
  };

  const handleSubmitImage = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (isProLocked) {
      setLocalError("זיהוי מוצרים מתמונה (Gemini Vision) זמין למסלול PRO ומעלה.");
      return;
    }
    if (!selectedFile) {
      setLocalError("יש להעלות או לגרור תמונת מוצר תחילה.");
      return;
    }
    onMultimodalMatch({
      file: selectedFile,
      hint_text: hintText.trim() || undefined,
    });
  };

  const handlePresetClick = (preset: string) => {
    setLocalError(null);
    setActiveTab("text");
    setTextInput(preset);
    setStoreQuery(preset);
    onTextSearch(preset);
  };

  const tabs: Array<{
    id: SearchTab;
    label: string;
    icon: typeof Search;
    proBadge?: boolean;
  }> = [
    { id: "text", label: "חיפוש חכם", icon: Search },
    { id: "url", label: "הדבקת קישור (URL)", icon: Link2, proBadge: isProLocked },
    {
      id: "image",
      label: "זיהוי מתמונה (Vision PRO)",
      icon: ImagePlus,
      proBadge: isProLocked,
    },
  ];

  return (
    <section
      aria-label="סרגל חיפוש רב-מודאלי"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Mode Tabs */}
      <div
        role="tablist"
        aria-label="אפשרויות חיפוש"
        className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setLocalError(null);
                setActiveTab(tab.id);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.proBadge && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  <Lock className="h-3 w-3" />
                  <span dir="ltr">PRO</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Text Search Tab */}
      {activeTab === "text" && (
        <form onSubmit={handleSubmitText} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder='חפש מוצר, דגם או מק״ט (למשל: "אוזניות Sony WH-1000XM5 עד 1,100 ש״ח")'
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pe-4 ps-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            {isStreaming && onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                <Square className="h-4 w-4 fill-current" />
                <span>עצור חיפוש</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={isStreaming}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                <span>הפעל סוכנים</span>
              </button>
            )}
          </div>
        </form>
      )}

      {/* URL Match Tab */}
      {activeTab === "url" && (
        <form onSubmit={handleSubmitUrl} className="space-y-3">
          {isProLocked && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
              <span className="inline-flex items-center gap-2 font-medium">
                <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                שליפת מפרט ומציאת חלופות מקישור (URL Context) זמינה במסלול{" "}
                <span dir="ltr" className="font-bold">
                  PRO
                </span>
                .
              </span>
              <Link
                href="/profile"
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-700"
              >
                שדרג ל-PRO
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="url"
              dir="ltr"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.amazon.com/dp/B09XS7JWHH"
              className="sm:col-span-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <input
              type="text"
              value={hintText}
              onChange={(e) => setHintText(e.target.value)}
              placeholder="רמז דגם אופציונלי (למשל XM5)"
              className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isStreaming || isProLocked}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" />
              <span>זהה והשווה מחירים</span>
            </button>
          </div>
        </form>
      )}

      {/* Image Dropzone Tab */}
      {activeTab === "image" && (
        <form onSubmit={handleSubmitImage} className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFileSelection(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={cn(
              "relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition",
              isDragging
                ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30"
                : "border-slate-300 bg-slate-50 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-950",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFileSelection(e.target.files?.[0])}
            />

            {isProLocked && (
              <span className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                <Lock className="h-3.5 w-3.5" />
                <span>נעול ב-FREE · PRO בלבד</span>
              </span>
            )}

            {previewUrl && selectedFile ? (
              <div
                className="flex flex-col items-center gap-3 sm:flex-row"
                onClick={(e) => e.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="תצוגה מקדימה של המוצר"
                  className="h-24 w-24 rounded-xl border border-slate-200 object-cover dark:border-slate-700"
                />
                <div className="text-start">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <span dir="ltr">{selectedFile.name}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span dir="ltr">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-300"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>הסר תמונה</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Upload className="mb-2 h-8 w-8 text-indigo-500" />
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  גרור תמונת מוצר או צילום מסך לכאן, או לחץ לבחירת קובץ
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  תומך ב-<span dir="ltr">JPG / PNG / WebP</span> עד{" "}
                  <span dir="ltr">5MB</span> · מופעל על ידי{" "}
                  <span dir="ltr">Gemini 3.5 Flash-Lite Vision</span>
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={hintText}
              onChange={(e) => setHintText(e.target.value)}
              placeholder="הערה או מותג משוער (אופציונלי)"
              className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={isStreaming || isProLocked || !selectedFile}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              <span>זהה מוצר וחפש דילים</span>
            </button>
          </div>
        </form>
      )}

      {localError && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          {localError}
        </p>
      )}

      {/* Quick Demo Presets */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          חיפושים לדוגמה:
        </span>
        {DEMO_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={isStreaming}
            onClick={() => handlePresetClick(preset)}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/50"
          >
            <span dir="ltr">{preset}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
