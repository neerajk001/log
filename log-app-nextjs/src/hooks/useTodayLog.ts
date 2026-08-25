'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import type { DailyLog, DailyField } from '@/src/api/types';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function useTodayLog() {
  const today = isoDaysAgo(0);
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);
  const [yesterday, setYesterday] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ field: DailyField; value: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const logs = await api.getDailyLogs(isoDaysAgo(8), today);
      const todayEntry = logs.find((l) => l.date === today) ?? null;
      const prior = [...logs].reverse().find((l) => l.date < today) ?? null;
      setTodayLog(todayEntry);
      setYesterday(prior);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [today]);

  const save = useCallback(
    async (field: DailyField, value: number) => {
      setRetry(null);
      const previous = todayLog;
      // optimistic update
      setTodayLog((cur) => ({ ...(cur ?? { id: '', user_id: '', date: today, created_at: '', updated_at: '' }), [field]: value } as DailyLog));
      try {
        const saved = await api.upsertDailyLog(today, { [field]: value });
        setTodayLog(saved);
      } catch (e) {
        setTodayLog(previous);
        setRetry({ field, value });
        setError(e instanceof ApiError ? e.message : 'Save failed');
      }
    },
    [today, todayLog],
  );

  const retrySave = useCallback(async () => {
    if (!retry) return;
    await save(retry.field, retry.value);
  }, [retry, save]);

  useEffect(() => {
    load();
  }, [load]);

  return { today, todayLog, yesterday, loading, error, retry, save, retrySave, reload: load };
}
