import { useState, useEffect, useCallback } from "react";
import { usePlansApi } from "../api/plans";
import type { PlanToday } from "../api/types";

export function usePlanToday() {
  const api = usePlansApi();
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [day, setDay] = useState<PlanToday["day"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const plans = await api.getPlans();
      const active = plans.find((p) => p.is_active) ?? null;
      if (!active) {
        setPlanId(null);
        setPlanName(null);
        setDay(null);
        return;
      }
      setPlanId(active.id);
      setPlanName(active.name);
      const today = await api.getPlanToday(active.id);
      setDay(today.day);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { planId, planName, day, loading, error, refetch: fetch };
}
