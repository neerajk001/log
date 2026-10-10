import { useCallback, useEffect, useState } from "react";
import { useCoachApi } from "../api/coach";
import { useDataSync } from "./useDataSync";
import type { CoachMemory } from "../api/types";

/** What the coach remembers long-term. */
export function useCoachMemory() {
  const api = useCoachApi();
  const [memory, setMemory] = useState<CoachMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMemory(await api.getMemory());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  useDataSync(["coach"], load);

  const clear = useCallback(async () => {
    setMemory(null);
    try {
      await api.clearMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear memory");
      await load();
    }
  }, [api, load]);

  return { memory, loading, error, clear, refetch: load };
}
