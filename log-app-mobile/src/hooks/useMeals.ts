import { useCallback, useState } from "react";
import { useMealsApi } from "../api/meals";
import { useDataSyncOnFocus } from "./useDataSync";
import type { MealLog } from "../api/types";

/** The meals logged on a given day, with delete. */
export function useMeals(date: string) {
  const api = useMealsApi();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMeals(date);
      setMeals(res.meals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meals");
    } finally {
      setLoading(false);
    }
  }, [api, date]);

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
