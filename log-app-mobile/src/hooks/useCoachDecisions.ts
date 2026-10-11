import { useCallback, useEffect, useState } from "react";
import { useCoachApi } from "../api/coach";
import { useDataSync } from "./useDataSync";
import type { CoachDecision } from "../api/types";

/** What the coach has advised, newest first — its side of the conversation. */
export function useCoachDecisions(limit = 20) {
  const api = useCoachApi();
  const [decisions, setDecisions] = useState<CoachDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDecisions(await api.getDecisions(limit));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the advice log");
    } finally {
      setLoading(false);
    }
  }, [api, limit]);

  useEffect(() => {
    load();
  }, [load]);

  // A new decision (a chat turn or a weekly verdict) refreshes the list.
  useDataSync(["coach"], load);

  const clear = useCallback(async () => {
    setDecisions([]);
    try {
      await api.clearDecisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear the advice log");
      await load();
    }
  }, [api, load]);

  return { decisions, loading, error, clear, refetch: load };
}
