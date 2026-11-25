"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2, LogIn, Mail, ShieldCheck } from "lucide-react";
import { loginSchema } from "@/lib/schemas";
import { ApiError } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/providers/AppProviders";

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const nextPath = searchParams.get("next") || "/";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      showToast("התחברת בהצלחה ל-DealScout AI", "success");
      router.push(nextPath.startsWith("/") ? nextPath : "/");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "התחברות נכשלה. בדוק אימייל וסיסמה ונסה שוב.";
      setServerError(msg);
    }
  };

  return (
    <div className="mx-auto my-8 max-w-md">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/15 text-indigo-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              התחברות לחשבון
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              כניסה מאובטחת לסוכני הקניות והארנק שלך
            </p>
          </div>
        </div>

        {serverError && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-400"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
            >
              כתובת אימייל
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
              <input
                id="login-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                placeholder="name@example.com"
                {...register("email")}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2.5 pe-3 ps-10 text-sm text-[var(--text-primary)] outline-none transition focus:border-indigo-500"
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-xs text-rose-400">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
            >
              סיסמה
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
              <input
                id="login-password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                placeholder="••••••••••"
                {...register("password")}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2.5 pe-3 ps-10 text-sm text-[var(--text-primary)] outline-none transition focus:border-indigo-500"
              />
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-rose-400">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            <span>{isSubmitting ? "מתחבר..." : "התחברות"}</span>
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
          <span className="text-xs text-[var(--text-muted)]">או</span>
          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
        </div>

        <a
          href="/api/v1/auth/oauth/google?frontend_callback=/auth/callback"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-indigo-500/40"
        >
          <span dir="ltr" className="font-bold text-indigo-400">
            G
          </span>
          <span>התחברות מהירה עם Google</span>
        </a>

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          עדיין אין לך חשבון?{" "}
          <Link href="/register" className="font-semibold text-indigo-400 hover:underline">
            הרשמה בחינם
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto my-8 h-96 max-w-md animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]" />
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
