"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { normalizeUserProfile } from "@/lib/normalizers";
import { useAuthStore } from "@/store/authStore";
import type { UserProfile, UserRole } from "@/types/api";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
  user_id: string;
  email: string;
  role: UserRole;
  tier: UserRole;
}

export interface RegisterResponse {
  user_id: string;
  email: string;
  full_name: string;
  tier: UserRole;
  is_verified: boolean;
  verification_token: string;
  message: string;
}

export interface VerifyEmailResponse {
  verified: boolean;
  user_id: string;
  email: string;
  message: string;
}

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const setSession = useAuthStore((s) => s.setSession);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const updateUser = useAuthStore((s) => s.updateUser);
  const clearSession = useAuthStore((s) => s.clearSession);

  const refreshProfile = useCallback(async (): Promise<UserProfile> => {
    const meRaw = await apiFetch<Record<string, unknown>>("/api/v1/users/me");
    const profile = normalizeUserProfile(meRaw);
    updateUser(profile);
    return profile;
  }, [updateUser]);

  const login = useCallback(
    async (email: string, password: string): Promise<UserProfile> => {
      const tokenData = await apiFetch<TokenResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      setAccessToken(tokenData.access_token);

      const meRaw = await apiFetch<Record<string, unknown>>("/api/v1/users/me", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const profile = normalizeUserProfile(meRaw);
      setSession(tokenData.access_token, profile);
      return profile;
    },
    [setAccessToken, setSession],
  );

  const register = useCallback(
    async (
      full_name: string,
      email: string,
      password: string,
    ): Promise<RegisterResponse> => {
      return apiFetch<RegisterResponse>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ full_name, email, password }),
      });
    },
    [],
  );

  const verifyEmail = useCallback(
    async (token: string): Promise<VerifyEmailResponse> => {
      return apiFetch<VerifyEmailResponse>("/api/v1/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      /* always clear local session even if server logout fails */
    } finally {
      clearSession();
      queryClient.clear();
      router.push("/login");
    }
  }, [clearSession, queryClient, router]);

  return {
    user,
    accessToken,
    isInitialized,
    isAuthenticated: Boolean(user && accessToken),
    login,
    register,
    verifyEmail,
    logout,
    refreshProfile,
  };
}
