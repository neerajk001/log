import { useState, useCallback } from "react";
import { useVerdictApi } from "../api/verdict";
import { useDataSyncOnFocus } from "./useDataSync";
import { useCurrentDate } from "./useCurrentDate";
import { useLatest } from "./useLatest";
import type { VerdictResponse } from "../api/types";

export function useWeeklyVerdict() {
  const api = useVerdictApi();
  const [data, setData] = useState<VerdictResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();
  // The athlete's local date — the server's UTC week can be a day off near
  // midnight, and a rollover while the app is open must refresh the verdict.
  const today = useCurrentDate();

  const fetch = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const result = await api.getWeeklyVerdict(today);
      if (!isCurrent(token)) return;
      setData(result);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load verdict");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, today, begin, isCurrent]);

  useDataSyncOnFocus(["verdict"], fetch);

  return { data, loading, error, refetch: fetch };
}