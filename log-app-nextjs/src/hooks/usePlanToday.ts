'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import type { PlanDay, PlanToday } from '@/src/api/types';

export function usePlanToday() {
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [day, setDay] = useState<PlanToday['day']>(null);
  const [allDays, setAllDays] = useState<PlanDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const plans = await api.listPlans();
      const active = plans.find((p) => p.is_active) ?? null;
      if (!active) {
        setPlanId(null);
        setPlanName(null);
        setDay(null);
        setAllDays([]);
        return;
      }
      setPlanId(active.id);
      setPlanName(active.name);
      setAllDays(active.days);
      const today = await api.getPlanToday(active.id);
      setDay(today.day);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { planId, planName, day, allDays, loading, error, reload: load };
}
