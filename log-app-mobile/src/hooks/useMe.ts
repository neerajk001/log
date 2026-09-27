import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMeApi } from "../api/me";
import type { DailyDefaults, UserProfile } from "../api/types";

export function useMe() {
  const api = useMeApi();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const updateQueueRef = useRef<Promise<unknown>>(Promise.resolve());

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
    load();
  }, [load]);

  const update = useCallback(
    async (patch: {
      protein_target_g?: number | null;
      calorie_target?: number | null;
      daily_defaults?: DailyDefaults | null;
    }) => {
      const run = updateQueueRef.current.then(() => api.updateMe(patch));
      updateQueueRef.current = run.catch(() => {});
      const updated = await run;
      setProfile(updated);
      return updated;
    },
    [api],
  );

  const defaults = useMemo<DailyDefaults>(() => profile?.daily_defaults ?? {}, [profile]);

  return { profile, defaults, loading, error, update, refetch: load };
}
