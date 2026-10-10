import { useCallback, useEffect, useState } from "react";
import { useCoachApi } from "../api/coach";
import { useDataSync } from "./useDataSync";
import type { CoachProfile, CoachProfileInput } from "../api/types";

export function useCoachProfile() {
  const api = useCoachApi();
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [loading, setLoading] = useState(true);
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

  return { profile, loading, error, save, refetch: load };
}
