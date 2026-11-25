"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Save, ShieldAlert, UserCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ClubWalletSelector } from "@/components/profile/ClubWalletSelector";
import {
  MemoryPreferencesForm,
  type MemoryPreferencesValues,
} from "@/components/profile/MemoryPreferencesForm";
import { apiFetch } from "@/lib/apiClient";
import { profileUpdateSchema } from "@/lib/schemas";
import { useAuthStore } from "@/store/authStore";
import type { NotificationChannel, UserProfile } from "@/types/api";

type ProfileFormValues = z.infer<typeof profileUpdateSchema>;

interface BuyerProfileApiResponse {
  user_id: string;
  preferred_currency: "ILS" | "USD" | "EUR";
  ship_to_country: string;
  credit_card_clubs: string[];
  preferred_stores: string[];
  min_seller_trust: number;
  notification_channels: NotificationChannel[];
  telegram_chat_id?: string | null;
  long_term_preferences?: {
    official_warranty_only?: boolean;
    max_delivery_days?: number;
    [key: string]: unknown;
  };
  updated_at?: string | null;
}

function ProfileContent() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => apiFetch<BuyerProfileApiResponse>("/api/v1/users/me/profile"),
  });

  const {
    watch,
    setValue,
    reset,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      preferred_currency: user?.preferred_currency ?? "ILS",
      ship_to_country: user?.ship_to_country ?? "IL",
      credit_card_clubs: user?.credit_card_clubs ?? [],
      preferred_stores: user?.preferred_stores ?? [],
      min_seller_trust: user?.min_seller_trust ?? 75,
      notification_channels: user?.notification_channels ?? ["email"],
      telegram_chat_id: user?.telegram_chat_id ?? "",
      long_term_preferences: {
        official_warranty_only: Boolean(
          user?.long_term_preferences?.official_warranty_only ?? false,
        ),
        max_delivery_days: Number(user?.long_term_preferences?.max_delivery_days ?? 14),
      },
    },
  });

  useEffect(() => {
    const p = profileQuery.data;
    if (!p) return;
    reset({
      preferred_currency: p.preferred_currency || "ILS",
      ship_to_country: p.ship_to_country || "IL",
      credit_card_clubs: Array.isArray(p.credit_card_clubs) ? p.credit_card_clubs : [],
      preferred_stores: Array.isArray(p.preferred_stores) ? p.preferred_stores : [],
      min_seller_trust: Number(p.min_seller_trust ?? 75),
      notification_channels:
        Array.isArray(p.notification_channels) && p.notification_channels.length > 0
          ? p.notification_channels
          : ["email"],
      telegram_chat_id: p.telegram_chat_id ?? "",
      long_term_preferences: {
        official_warranty_only: Boolean(p.long_term_preferences?.official_warranty_only ?? false),
        max_delivery_days: Number(p.long_term_preferences?.max_delivery_days ?? 14),
      },
    });
  }, [profileQuery.data, reset]);

  const saveMutation = useMutation({
    mutationFn: (payload: ProfileFormValues) =>
      apiFetch<BuyerProfileApiResponse>("/api/v1/users/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          ...payload,
          telegram_chat_id: payload.telegram_chat_id?.trim() || null,
        }),
      }),
    onSuccess: (updated) => {
      setSaveError(null);
      setSaveSuccess("הפרופיל, ארנק המועדונים וזיכרון הסוכן נשמרו בהצלחה.");
      queryClient.setQueryData(["user-profile"], updated);
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });

      if (user) {
        const mergedUser: UserProfile = {
          ...user,
          preferred_currency: updated.preferred_currency,
          ship_to_country: updated.ship_to_country,
          credit_card_clubs: updated.credit_card_clubs,
          preferred_stores: updated.preferred_stores,
          min_seller_trust: updated.min_seller_trust,
          notification_channels: updated.notification_channels,
          telegram_chat_id: updated.telegram_chat_id ?? null,
          long_term_preferences: updated.long_term_preferences ?? {},
        };
        updateUser(mergedUser);
      }
    },
    onError: (err) => {
      setSaveSuccess(null);
      setSaveError(err instanceof Error ? err.message : "שמירת הפרופיל נכשלה");
    },
  });

  const currentValues = watch();

  const handlePrefsPatch = (patch: Partial<MemoryPreferencesValues>) => {
    setSaveSuccess(null);
    if (patch.preferred_currency !== undefined) {
      setValue("preferred_currency", patch.preferred_currency, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (patch.ship_to_country !== undefined) {
      setValue("ship_to_country", patch.ship_to_country, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (patch.min_seller_trust !== undefined) {
      setValue("min_seller_trust", patch.min_seller_trust, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (patch.notification_channels !== undefined) {
      setValue("notification_channels", patch.notification_channels, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (patch.telegram_chat_id !== undefined) {
      setValue("telegram_chat_id", patch.telegram_chat_id, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (patch.preferred_stores !== undefined) {
      setValue("preferred_stores", patch.preferred_stores, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    if (
      patch.official_warranty_only !== undefined ||
      patch.max_delivery_days !== undefined
    ) {
      setValue(
        "long_term_preferences",
        {
          official_warranty_only:
            patch.official_warranty_only ??
            Boolean(currentValues.long_term_preferences?.official_warranty_only),
          max_delivery_days:
            patch.max_delivery_days ??
            Number(currentValues.long_term_preferences?.max_delivery_days ?? 14),
        },
        { shouldDirty: true, shouldValidate: true },
      );
    }
  };

  const memoryValues: MemoryPreferencesValues = {
    preferred_currency: currentValues.preferred_currency ?? "ILS",
    ship_to_country: currentValues.ship_to_country ?? "IL",
    min_seller_trust: Number(currentValues.min_seller_trust ?? 75),
    official_warranty_only: Boolean(
      currentValues.long_term_preferences?.official_warranty_only ?? false,
    ),
    max_delivery_days: Number(currentValues.long_term_preferences?.max_delivery_days ?? 14),
    notification_channels: currentValues.notification_channels ?? ["email"],
    telegram_chat_id: currentValues.telegram_chat_id ?? "",
    preferred_stores: currentValues.preferred_stores ?? [],
  };

  const fieldErrors: Partial<Record<string, string>> = {
    preferred_currency: errors.preferred_currency?.message,
    ship_to_country: errors.ship_to_country?.message,
    min_seller_trust: errors.min_seller_trust?.message,
    notification_channels: errors.notification_channels?.message,
    telegram_chat_id: errors.telegram_chat_id?.message,
    max_delivery_days: errors.long_term_preferences?.max_delivery_days?.message,
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header Card */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
            <UserCircle2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              פרופיל קונה, ארנק מועדונים וזיכרון
            </h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              {user?.full_name} · <span dir="ltr">{user?.email}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            dir="ltr"
            className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300"
          >
            {user?.tier || "FREE"}
          </span>
        </div>
      </header>

      {profileQuery.isLoading && (
        <div className="space-y-4">
          <div className="h-44 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800/60" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800/60" />
        </div>
      )}

      {profileQuery.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>שגיאה בטעינת הפרופיל מהשרת.</span>
          </span>
          <button
            type="button"
            onClick={() => profileQuery.refetch()}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
          >
            נסה שוב
          </button>
        </div>
      )}

      {saveSuccess && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-700 dark:text-rose-300"
        >
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit((vals) => {
          setSaveSuccess(null);
          setSaveError(null);
          saveMutation.mutate(vals);
        })}
        className="space-y-6"
      >
        <ClubWalletSelector
          selectedClubs={currentValues.credit_card_clubs ?? []}
          disabled={saveMutation.isPending}
          error={errors.credit_card_clubs?.message}
          onChange={(clubs) => {
            setSaveSuccess(null);
            setValue("credit_card_clubs", clubs, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
        />

        <MemoryPreferencesForm
          values={memoryValues}
          userTier={user?.tier ?? "FREE"}
          disabled={saveMutation.isPending}
          errors={fieldErrors}
          onChange={handlePrefsPatch}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {isDirty ? "יש שינויים שטרם נשמרו" : "הפרופיל מסונכרן עם זיכרון הסוכנים"}
          </span>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>שומר שינויים...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>שמור פרופיל והעדפות</span>
              </>
            )}
          </button>
        </div>
      </form>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
