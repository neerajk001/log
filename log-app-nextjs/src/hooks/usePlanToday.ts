'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import type { PlanToday } from '@/src/api/types';

export function usePlanToday() {
  const [planToday, setPlanToday] = useState<PlanToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const plans = await api.listPlans();
      const active = plans.find((p) => p.is_active) ?? null;
      if (!active) {
        setPlanToday(null);
        return;
      }
      const today = await api.getPlanToday(active.id);
      setPlanToday(today);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { planToday, loading, error, reload: load };
}
