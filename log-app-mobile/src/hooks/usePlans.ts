import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlansApi } from "../api/plans";
import type { PlanDay, WorkoutPlan } from "../api/types";

export function usePlans() {
  const api = usePlansApi();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await api.getPlans());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const activePlan = useMemo(
    () => plans.find((p) => p.is_active) ?? plans[0] ?? null,
    [plans],
  );

  const days: PlanDay[] = activePlan?.days ?? [];

  return { plans, activePlan, days, loading, error, refetch: load, setPlans };
}
