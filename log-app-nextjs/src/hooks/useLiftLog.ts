'use client';

import { useCallback, useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import type { LiftLog } from '@/src/api/types';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useLiftLog() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (input: { exercise_name: string; weight_kg: number; reps: number; plan_day_id?: string | null }) => {
      setSubmitting(true);
      setError(null);
      try {
        const saved: LiftLog = await api.createLiftLog({ date: todayStr(), ...input });
        return saved;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Failed to log lift');
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { submit, submitting, error };
}
