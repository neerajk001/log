import { useState, useEffect, useCallback } from "react";
import { useVerdictApi } from "../api/verdict";
import type { VerdictResponse } from "../api/types";

export function useWeeklyVerdict() {
  const api = useVerdictApi();
  const [data, setData] = useState<VerdictResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getWeeklyVerdict();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load verdict");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}