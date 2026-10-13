import { useCallback, useEffect, useState } from "react";
import { useCoachApi } from "../api/coach";
import { useDataSync } from "./useDataSync";
import type { CoachProfile, CoachProfileInput } from "../api/types";

export function useCoachProfile() {
  const api = useCoachApi();
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Whether a load has ever finished — distinct from `loading`, which also turns
  // on for background refreshes (e.g. the save that "Generate my plan" performs).
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await api.getProfile());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your profile");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  useDataSync(["coach"], load);

  const save = useCallback(
    async (data: CoachProfileInput) => {
      const saved = await api.saveProfile(data);
      setProfile(saved);
      return saved;
    },
    [api],
  );

  return { profile, loading, loaded, error, save, refetch: load };
}
