import { useCallback, useMemo, useState } from "react";
import { usePlansApi } from "../api/plans";
import { useDataSyncOnFocus } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { PlanDay, WorkoutPlan } from "../api/types";

export function usePlans() {
  const api = usePlansApi();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const next = await api.getPlans();
      if (!isCurrent(token)) return;
      setPlans(next);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, begin, isCurrent]);

  useDataSyncOnFocus(["plans"], load);

  const activePlan = useMemo(
    () => plans.find((p) => p.is_active) ?? plans[0] ?? null,
    [plans],
  );

  const days: PlanDay[] = activePlan?.days ?? [];

  return { plans, activePlan, days, loading, error, refetch: load, setPlans };
}
