"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { refreshAccessTokenWithMutex } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/formatters";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within AppProviders");
  }
  return ctx;
}

export type ToastTone = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone, durationMs?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within AppProviders");
  }
  return ctx;
}

function applyThemeClass(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const bootstrappedRef = useRef(false);
  const markInitialized = useAuthStore((s) => s.markInitialized);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let active = true;
    (async () => {
      try {
        await refreshAccessTokenWithMutex();
      } finally {
        if (active) {
          markInitialized();
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [markInitialized]);

  return <>{children}</>;
}

const TOAST_STYLES: Record<ToastTone, { border: string; icon: React.ReactNode }> = {
  success: {
    border: "border-emerald-500/40 bg-emerald-950/90 text-emerald-100",
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />,
  },
  error: {
    border: "border-rose-500/40 bg-rose-950/90 text-rose-100",
    icon: <XCircle className="h-4 w-4 shrink-0 text-rose-400" />,
  },
  warning: {
    border: "border-amber-500/40 bg-amber-950/90 text-amber-100",
    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />,
  },
  info: {
    border: "border-indigo-500/40 bg-slate-900/95 text-slate-100",
    icon: <Info className="h-4 w-4 shrink-0 text-indigo-400" />,
  },
};

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const [theme, setThemeState] = useState<Theme>("dark");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dealscout_theme");
      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
        applyThemeClass(saved);
        return;
      }
    } catch {
      /* ignore storage errors */
    }
    applyThemeClass("dark");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyThemeClass(next);
    try {
      localStorage.setItem("dealscout_theme", next);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyThemeClass(next);
      try {
        localStorage.setItem("dealscout_theme", next);
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "info", durationMs = 4200) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      if (durationMs > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, durationMs);
      }
    },
    [],
  );

  const themeValue = useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme],
  );

  const toastValue = useMemo(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeContext.Provider value={themeValue}>
        <ToastContext.Provider value={toastValue}>
          <AuthBootstrap>{children}</AuthBootstrap>

          {toasts.length > 0 && (
            <div
              aria-live="polite"
              aria-label="התראות מערכת"
              className="fixed bottom-4 start-4 z-50 flex max-w-sm flex-col gap-2"
            >
              {toasts.map((t) => {
                const style = TOAST_STYLES[t.tone];
                return (
                  <div
                    key={t.id}
                    role="status"
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur-md",
                      style.border,
                    )}
                  >
                    {style.icon}
                    <span className="flex-1 leading-snug">{t.message}</span>
                    <button
                      type="button"
                      onClick={() => dismissToast(t.id)}
                      aria-label="סגור התראה"
                      className="rounded p-1 opacity-70 transition hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ToastContext.Provider>
      </ThemeContext.Provider>
    </QueryClientProvider>
  );
}
