import { useCallback, useEffect, useState } from "react";
import { useMealsApi } from "../api/meals";
import { useLatest } from "./useLatest";
import type { MealSuggestionsResponse } from "../api/types";

/**
 * Pro eat-now suggestions for a day. Fetches when the sheet requesting them
 * opens (or the date changes) — suggestions depend on what is still left, so
 * they are never served from a stale conversation.
 */
export function useMealSuggestions(date: string, enabled: boolean) {
  const api = useMealsApi();
  const [data, setData] = useState<MealSuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  const load = useCallback(async () => {
    if (!enabled) return;
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const result = await api.getMealSuggestions(date);
      if (!isCurrent(token)) return;
      setData(result);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Couldn't load suggestions");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, date, enabled, begin, isCurrent]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    void load();
  }, [enabled, load]);

  return { data, loading, error, refetch: load };
}
