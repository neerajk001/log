import { useCallback, useEffect, useState } from "react";
import { useCoachApi } from "../api/coach";
import { useDataSync } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { CoachDecision } from "../api/types";

/** What the coach has advised, newest first — its side of the conversation. */
export function useCoachDecisions(limit = 20) {
  const api = useCoachApi();
  const [decisions, setDecisions] = useState<CoachDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const next = await api.getDecisions(limit);
      if (!isCurrent(token)) return;
      setDecisions(next);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load the advice log");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, limit, begin, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  // A new decision (a chat turn or a weekly verdict) refreshes the list.
  useDataSync(["coach"], load);

  const clear = useCallback(async () => {
    setDecisions([]);
    // The cleared state is newer than any in-flight load.
    begin();
    try {
      await api.clearDecisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear the advice log");
      await load();
    }
  }, [api, load, begin]);

  return { decisions, loading, error, clear, refetch: load };
}
