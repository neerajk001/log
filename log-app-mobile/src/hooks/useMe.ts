import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMeApi } from "../api/me";
import { useDataSync } from "./useDataSync";
import type { DailyDefaults, OnboardingInput, UserProfile } from "../api/types";

export function useMe(enabled = true) {
  const api = useMeApi();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const updateQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enabledRef = useRef(enabled);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await api.getMe());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      // Signed out (or otherwise gated): no profile, no wasted 401 fetch — and
      // no stale previous-user profile flashing on the next sign-in.
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }
    load();
  }, [load, enabled]);

  // Prefs changed in Settings (or at the end of onboarding) refresh every reader.
  // No focus hook: this also runs in the root layout, outside any screen.
  // Gated the same way: invalidations must not fetch while disabled.
  const syncLoad = useCallback(() => {
    if (enabledRef.current) load();
  }, [load]);
  useDataSync(["me"], syncLoad);

  const update = useCallback(
    async (patch: {
      protein_target_g?: number | null;
      calorie_target?: number | null;
      daily_defaults?: DailyDefaults | null;
      rest_days?: number[] | null;
      meal_tracking_enabled?: boolean;
      ai_coach_enabled?: boolean;
      track_weight?: boolean;
      /** Dev/testing: flip the first-run onboarding flag. */
      onboarded?: boolean;
    }) => {
      const run = updateQueueRef.current.then(() => api.updateMe(patch));
      updateQueueRef.current = run.catch(() => {});
      const updated = await run;
      setProfile(updated);
      return updated;
    },
    [api],
  );

  const completeOnboarding = useCallback(
    async (data: OnboardingInput) => {
      const updated = await api.completeOnboarding(data);
      setProfile(updated);
      return updated;
    },
    [api],
  );

  const defaults = useMemo<DailyDefaults>(() => profile?.daily_defaults ?? {}, [profile]);

  return { profile, defaults, loading, error, update, completeOnboarding, refetch: load };
}
