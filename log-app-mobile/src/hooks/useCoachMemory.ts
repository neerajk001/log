import { useCallback, useEffect, useState } from "react";
import { useCoachApi } from "../api/coach";
import { useDataSync } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { CoachMemory } from "../api/types";

/** What the coach remembers long-term. */
export function useCoachMemory() {
  const api = useCoachApi();
  const [memory, setMemory] = useState<CoachMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const next = await api.getMemory();
      if (!isCurrent(token)) return;
      setMemory(next);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load memory");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, begin, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  useDataSync(["coach"], load);

  const clear = useCallback(async () => {
    setMemory(null);
    // The cleared state is newer than any in-flight load.
    begin();
    try {
      await api.clearMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear memory");
      await load();
    }
  }, [api, load, begin]);

  return { memory, loading, error, clear, refetch: load };
}
