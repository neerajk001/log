import { useState, useEffect, useCallback } from "react";
import { useTrendsApi } from "../api/trends";
import type { TrendsResponse } from "../api/types";

export function useTrends() {
  const api = useTrendsApi();
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTrends();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trends");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}