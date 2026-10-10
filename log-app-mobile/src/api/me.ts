import { useMemo } from "react";
import { useApiClient } from "./client";
import type { DailyDefaults, OnboardingInput, UserProfile } from "./types";

export function useMeApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      getMe: () => client.get<UserProfile>("/api/me"),
      updateMe: (data: {
        protein_target_g?: number | null;
        calorie_target?: number | null;
        daily_defaults?: DailyDefaults | null;
        rest_days?: number[] | null;
        meal_tracking_enabled?: boolean;
        ai_coach_enabled?: boolean;
        /** Dev/testing: flip the first-run onboarding flag. */
        onboarded?: boolean;
      }) => client.put<UserProfile>("/api/me", data),
      completeOnboarding: (data: OnboardingInput) =>
        client.post<UserProfile>("/api/me/onboarding", data),
    }),
    [client],
  );
}
