"use client";

import { create } from "zustand";
import type { UserProfile } from "@/types/api";

interface AuthState {
  /** Strictly in-memory JWT access token — never persisted to localStorage/sessionStorage. */
  accessToken: string | null;
  user: UserProfile | null;
  isInitialized: boolean;
  setSession: (accessToken: string, user: UserProfile) => void;
  setAccessToken: (accessToken: string | null) => void;
  updateUser: (user: UserProfile) => void;
  incrementSearchesUsed: () => void;
  markInitialized: () => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isInitialized: false,
  setSession: (accessToken, user) => {
    if (typeof document !== "undefined") {
      document.cookie = "dealscout_session=1; path=/; SameSite=Lax; max-age=604800";
    }
    set({ accessToken, user, isInitialized: true });
  },
  setAccessToken: (accessToken) => set({ accessToken }),
  updateUser: (user) => set({ user }),
  incrementSearchesUsed: () =>
    set((state) => {
      if (!state.user) return state;
      return {
        user: {
          ...state.user,
          daily_searches_used: state.user.daily_searches_used + 1,
        },
      };
    }),
  markInitialized: () => set({ isInitialized: true }),
  clearSession: () => {
    if (typeof document !== "undefined") {
      document.cookie = "dealscout_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
    set({ accessToken: null, user: null, isInitialized: true });
  },
}));
