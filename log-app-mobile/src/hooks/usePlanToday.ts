import { useState, useEffect, useCallback, useRef } from "react";
import { usePlansApi } from "../api/plans";
import { useDataSyncOnFocus } from "./useDataSync";
import type { PlanToday } from "../api/types";

/**
 * Today's plan day (rotation is computed server-side). Pass the live date
 * from `useCurrentDate()` so a midnight rollover while the app is open
 * refetches the new day instead of showing yesterday's.
 */
export function usePlanToday(scopeDate?: string) {
  const api = usePlansApi();
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [day, setDay] = useState<PlanToday["day"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const firstScope = useRef(scopeDate);

  const fetch = useCallback(async (force = false) => {
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
      const today = await api.getPlanToday(active.id, force ? { force: true } : undefined);
      setDay(today.day);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useDataSyncOnFocus(["plans"], fetch);

  useEffect(() => {
    // Midnight rollover: bypass the GET cache (a 23:59 fetch may still be
    // fresh) to get the newly rotated day. No-op on mount.
    if (scopeDate !== undefined && scopeDate !== firstScope.current) {
      firstScope.current = scopeDate;
      fetch(true);
    }
  }, [scopeDate, fetch]);

  return { planId, planName, day, loading, error, refetch: fetch };
}
