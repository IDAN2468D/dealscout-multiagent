"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sliders,
  Sparkles,
  Sun,
  User,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { useTheme } from "@/components/providers/AppProviders";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/formatters";
import type { UserRole } from "@/types/api";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "חיפוש מבצעים", icon: Search },
  { href: "/cart-optimizer", label: "פיצול סל $75", icon: ShoppingCart },
  { href: "/watchlist", label: "מעקב מחירים", icon: Bell },
  { href: "/savings", label: "ארנק וחיסכון", icon: Wallet },
  { href: "/profile", label: "פרופיל ומועדונים", icon: User },
  { href: "/admin", label: "ניהול מערכת", icon: Sliders, adminOnly: true },
];

const TIER_BADGE_CLASSES: Record<UserRole, string> = {
  FREE: "border-slate-500/40 bg-slate-500/15 text-slate-300 dark:text-slate-300",
  PRO: "border-indigo-500/40 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  ADMIN: "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300",
};

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { user, isInitialized, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === "ADMIN",
  );

  const quotaUsed = user?.daily_searches_used ?? 0;
  const quotaLimit = user?.daily_searches_limit ?? 10;
  const quotaPct = quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0;
  const nearQuota = quotaPct >= 80;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 text-[var(--text-primary)] transition hover:opacity-90"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-500 text-white shadow-md shadow-indigo-600/20">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="flex items-center gap-1 text-base font-extrabold tracking-tight">
              <span dir="ltr">DealScout AI</span>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </span>
            <span className="hidden text-[11px] text-[var(--text-muted)] sm:block">
              סוכן חיסכון וקניות חכם
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav aria-label="ניווט ראשי" className="hidden items-center gap-1 lg:flex">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/" || pathname.startsWith("/search")
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-indigo-600/15 text-indigo-500 dark:text-indigo-300"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Quota Meter for FREE tier */}
          {user && user.tier === "FREE" && (
            <div
              title="מכסת חיפושים יומית"
              className={cn(
                "hidden items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium sm:flex",
                nearQuota
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-300"
                  : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
              )}
            >
              <span dir="ltr" className="tabular-nums font-bold">
                {quotaUsed}/{quotaLimit}
              </span>
              <span>חיפושים</span>
            </div>
          )}

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-600" />
            )}
          </button>

          {/* Desktop User Menu / Auth Buttons */}
          {!isInitialized ? (
            <div className="hidden h-9 w-28 animate-pulse rounded-xl bg-[var(--bg-elevated)] sm:block" />
          ) : user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <span
                dir="ltr"
                className={cn(
                  "rounded-lg border px-2 py-0.5 text-xs font-bold",
                  TIER_BADGE_CLASSES[user.tier],
                )}
              >
                {user.tier}
              </span>
              <Link
                href="/profile"
                className="max-w-[140px] truncate text-sm font-medium text-[var(--text-primary)] hover:underline"
              >
                {user.full_name || user.email}
              </Link>
              <button
                type="button"
                onClick={logout}
                aria-label="התנתק"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>התנתק</span>
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3.5 py-1.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)]"
              >
                <LogIn className="h-4 w-4" />
                <span>התחברות</span>
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              >
                <UserPlus className="h-4 w-4" />
                <span>הרשמה</span>
              </Link>
            </div>
          )}

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-label="תפריט ניווט"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-4 lg:hidden">
          <nav aria-label="ניווט נייד" className="flex flex-col gap-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/" || pathname.startsWith("/search")
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-indigo-600/15 text-indigo-400"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            {user ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      dir="ltr"
                      className={cn(
                        "rounded-lg border px-2 py-0.5 text-xs font-bold",
                        TIER_BADGE_CLASSES[user.tier],
                      )}
                    >
                      {user.tier}
                    </span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {user.full_name || user.email}
                    </span>
                  </div>
                  {user.tier === "FREE" && (
                    <span dir="ltr" className="tabular-nums text-xs text-[var(--text-muted)]">
                      {quotaUsed}/{quotaLimit} חיפושים
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    logout();
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-400"
                >
                  <LogOut className="h-4 w-4" />
                  <span>התנתק</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
                >
                  <LogIn className="h-4 w-4" />
                  <span>התחברות</span>
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>הרשמה</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
