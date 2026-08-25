'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/src/api/client';
import type { DailyLog, DailyField } from '@/src/api/types';

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function useTodayLog(date: string = isoToday()) {
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);
  const [yesterday, setYesterday] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ field: DailyField; value: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const logs = await api.getDailyLogs(isoDaysBefore(date, 8), date);
      const entry = logs.find((l) => l.date === date) ?? null;
      const prior = [...logs].reverse().find((l) => l.date < date) ?? null;
      setTodayLog(entry);
      setYesterday(prior);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [date]);

  const save = useCallback(
    async (field: DailyField, value: number) => {
      setRetry(null);
      const previous = todayLog;
      setTodayLog((cur) => ({
        ...(cur ?? { id: '', user_id: '', date, created_at: '', updated_at: '' }),
        [field]: value,
      } as DailyLog));
      try {
        const saved = await api.upsertDailyLog(date, { [field]: value });
        setTodayLog(saved);
      } catch (e) {
        setTodayLog(previous);
        setRetry({ field, value });
        setError(e instanceof ApiError ? e.message : 'Save failed');
      }
    },
    [date, todayLog],
  );

  const retrySave = useCallback(async () => {
    if (!retry) return;
    await save(retry.field, retry.value);
  }, [retry, save]);

  useEffect(() => {
    load();
  }, [load]);

  return { today: date, todayLog, yesterday, loading, error, retry, save, retrySave, reload: load };
}
