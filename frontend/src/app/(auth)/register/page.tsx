"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from "lucide-react";
import { registerSchema } from "@/lib/schemas";
import { ApiError } from "@/lib/apiClient";
import { useAuth, type RegisterResponse } from "@/hooks/useAuth";
import { useToast } from "@/components/providers/AppProviders";

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerAccount, verifyEmail } = useAuth();
  const { showToast } = useToast();

  const [serverError, setServerError] = useState<string | null>(null);
  const [registeredData, setRegisteredData] = useState<RegisterResponse | null>(null);
  const [verifying, setVerifying] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      const res = await registerAccount(values.full_name, values.email, values.password);
      setRegisteredData(res);
      showToast("החשבון נוצר! אנא אמת את כתובת האימייל.", "success");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "ההרשמה נכשלה. נסה שוב בעוד רגע.";
      setServerError(msg);
    }
  };

  const handleVerifyNow = async () => {
    if (!registeredData?.verification_token) return;
    setServerError(null);
    setVerifying(true);
    try {
      await verifyEmail(registeredData.verification_token);
      showToast("האימייל אומת בהצלחה! כעת ניתן להתחבר.", "success");
      router.push("/login");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "אימות האימייל נכשל.";
      setServerError(msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="mx-auto my-8 max-w-md">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              פתיחת חשבון חדש
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              הצטרף ל-DealScout AI וקבל גישה מידית לסוכן הדילים
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

        {registeredData ? (
          <div className="mt-6 space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <h2 className="text-base font-bold">הרשמתך נקלטה בהצלחה!</h2>
            </div>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              נשלח אימות עבור{" "}
              <span dir="ltr" className="font-semibold text-[var(--text-primary)]">
                {registeredData.email}
              </span>
              . להדגמה מהירה בסביבה המקומית, טוקן האימות שלך זמין כאן:
            </p>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
              <div className="text-[11px] text-[var(--text-muted)]">
                Verification Token
              </div>
              <code
                dir="ltr"
                className="mt-1 block break-all text-xs font-mono text-indigo-400"
              >
                {registeredData.verification_token}
              </code>
            </div>

            <button
              type="button"
              onClick={handleVerifyNow}
              disabled={verifying}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>
                {verifying ? "מאמת אימייל..." : "אמת אימייל והמשך להתחברות"}
              </span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="reg-name"
                className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
              >
                שם מלא
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
                <input
                  id="reg-name"
                  type="text"
                  autoComplete="name"
                  placeholder="ישראל ישראלי"
                  {...register("full_name")}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2.5 pe-3 ps-10 text-sm text-[var(--text-primary)] outline-none transition focus:border-indigo-500"
                />
              </div>
              {errors.full_name && (
                <p className="mt-1 text-xs text-rose-400">
                  {errors.full_name.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="reg-email"
                className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
              >
                כתובת אימייל
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
                <input
                  id="reg-email"
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
                htmlFor="reg-password"
                className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
              >
                סיסמה (לפחות 10 תווים)
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
                <input
                  id="reg-password"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  placeholder="לפחות 10 תווים"
                  {...register("password")}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2.5 pe-3 ps-10 text-sm text-[var(--text-primary)] outline-none transition focus:border-indigo-500"
                />
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-rose-400">
                  {errors.password.message}
                </p>
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
                <UserPlus className="h-4 w-4" />
              )}
              <span>{isSubmitting ? "יוצר חשבון..." : "הרשמה"}</span>
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="font-semibold text-indigo-400 hover:underline">
            התחברות
          </Link>
        </p>
      </div>
    </div>
  );
}
