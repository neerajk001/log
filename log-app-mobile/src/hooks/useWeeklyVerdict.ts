import { useState, useCallback } from "react";
import { useVerdictApi } from "../api/verdict";
import { useDataSyncOnFocus } from "./useDataSync";
import type { VerdictResponse } from "../api/types";
import { todayLocal } from "../utils/date";

export function useWeeklyVerdict() {
  const api = useVerdictApi();
  const [data, setData] = useState<VerdictResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The athlete's local date — the server's UTC week can be a day off near midnight.
      const result = await api.getWeeklyVerdict(todayLocal());
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load verdict");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useDataSyncOnFocus(["verdict"], fetch);

  return { data, loading, error, refetch: fetch };
}