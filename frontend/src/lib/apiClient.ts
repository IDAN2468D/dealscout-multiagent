"use client";

import { normalizeUserProfile } from "@/lib/normalizers";
import { useAuthStore } from "@/store/authStore";

let activeRefreshPromise: Promise<string | null> | null = null;

/**
 * Single-flight 401 Mutex refresh calling POST /api/v1/auth/refresh with HttpOnly cookie.
 */
export async function refreshAccessTokenWithMutex(): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const res = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        useAuthStore.getState().clearSession();
        return null;
      }
      const tokenData = (await res.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        useAuthStore.getState().clearSession();
        return null;
      }
      useAuthStore.getState().setAccessToken(tokenData.access_token);

      const meRes = await fetch("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        credentials: "include",
      });
      if (meRes.ok) {
        const meJson = (await meRes.json()) as Record<string, unknown>;
        useAuthStore.getState().setSession(tokenData.access_token, normalizeUserProfile(meJson));
      }
      return tokenData.access_token;
    } catch {
      useAuthStore.getState().clearSession();
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export async function apiFetchRaw(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  const token = useAuthStore.getState().accessToken;
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
  });

  const isAuthEndpoint =
    path.includes("/api/v1/auth/login") || path.includes("/api/v1/auth/refresh");

  if (res.status === 401 && !isAuthEndpoint) {
    const newToken = await refreshAccessTokenWithMutex();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      return fetch(path, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  return res;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await apiFetchRaw(path, options);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let detail: unknown = null;
    try {
      const errBody = (await res.json()) as { detail?: unknown; message?: string };
      detail = errBody.detail;
      if (typeof errBody.detail === "string") {
        message = errBody.detail;
      } else if (Array.isArray(errBody.detail)) {
        message = errBody.detail
          .map((d) => (d as { msg?: string }).msg || JSON.stringify(d))
          .join(" | ");
      } else if (errBody.message) {
        message = errBody.message;
      }
    } catch {
      /* ignore non-JSON error body */
    }
    throw new ApiError(res.status, message, detail);
  }
  return (await res.json()) as T;
}
