import { useCallback, useEffect, useState } from "react";
import { useMealsApi } from "../api/meals";
import { useDataSyncOnFocus } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { MealLog } from "../api/types";

/** The meals logged on a given day, with delete. */
export function useMeals(date: string) {
  const api = useMealsApi();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  useEffect(() => {
    // Never render the previous day's meals under a new date while loading.
    setMeals([]);
    setLoading(true);
    setError(null);
  }, [date]);

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMeals(date);
      if (!isCurrent(token)) return;
      setMeals(res.meals);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load meals");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, date, begin, isCurrent]);

  useDataSyncOnFocus(["meals"], load);

  const remove = useCallback(
    async (id: string) => {
      const previous = meals;
      setMeals((cur) => cur.filter((m) => m.id !== id));
      try {
        await api.deleteMeal(id);
      } catch (err) {
        setMeals(previous);
        throw err;
      }
    },
    [api, meals],
  );

  return { meals, loading, error, refetch: load, remove };
}
