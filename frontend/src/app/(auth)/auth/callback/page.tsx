"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { normalizeUserProfile } from "@/lib/normalizers";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types/api";

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
  user_id: string;
  email: string;
  role: UserRole;
  tier: UserRole;
}

function OAuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const handledRef = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const code = searchParams.get("code");
    const email = searchParams.get("email");
    const fullName = searchParams.get("full_name");

    if (!code && !email) {
      setErrorMsg("חסרים פרמטרי אימות מ-Google OAuth2.");
      return;
    }

    const qs = new URLSearchParams();
    if (code) qs.set("code", code);
    if (email) qs.set("email", email);
    if (fullName) qs.set("full_name", fullName);

    (async () => {
      try {
        const tokenData = await apiFetch<OAuthTokenResponse>(
          `/api/v1/auth/oauth/google/callback?${qs.toString()}`,
        );
        setAccessToken(tokenData.access_token);

        const meRaw = await apiFetch<Record<string, unknown>>("/api/v1/users/me", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });
        const profile = normalizeUserProfile(meRaw);
        setSession(tokenData.access_token, profile);
        router.replace("/");
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "אימות Google OAuth2 נכשל. נסה להתחבר שוב.";
        setErrorMsg(msg);
      }
    })();
  }, [searchParams, router, setSession, setAccessToken]);

  if (errorMsg) {
    return (
      <div
        role="alert"
        className="mx-auto my-12 max-w-md rounded-2xl border border-rose-500/30 bg-[var(--bg-card)] p-8 text-center shadow-xl"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-[var(--text-primary)]">
          התחברות עם Google נכשלה
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{errorMsg}</p>
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            חזרה למסך ההתחברות
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto my-16 flex max-w-md flex-col items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-10 text-center shadow-xl">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
      <h1 className="mt-4 text-lg font-bold text-[var(--text-primary)]">
        משלים התחברות עם Google...
      </h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        טוען את פרופיל הקונה ומועדוני האשראי שלך
      </p>
    </div>
  );
}

export default function GoogleOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto my-16 flex max-w-md flex-col items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-10 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
          <p className="mt-4 text-sm text-[var(--text-muted)]">מאמת סשן...</p>
        </div>
      }
    >
      <OAuthCallbackHandler />
    </Suspense>
  );
}
