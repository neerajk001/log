import { useCallback, useEffect, useState } from "react";
import { useCoachApi } from "../api/coach";
import { useDataSync } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { CoachProfile, CoachProfileInput } from "../api/types";

export function useCoachProfile() {
  const api = useCoachApi();
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Whether a load has ever finished — distinct from `loading`, which also turns
  // on for background refreshes (e.g. the save that "Generate my plan" performs).
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const next = await api.getProfile();
      if (!isCurrent(token)) return;
      setProfile(next);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load your profile");
    } finally {
      if (isCurrent(token)) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [api, begin, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  useDataSync(["coach"], load);

  const save = useCallback(
    async (data: CoachProfileInput) => {
      const saved = await api.saveProfile(data);
      // Newer than any in-flight load; don't let a stale GET overwrite it.
      begin();
      setProfile(saved);
      return saved;
    },
    [api, begin],
  );

  return { profile, loading, loaded, error, save, refetch: load };
}
