import { useState, useEffect, useCallback, useRef } from "react";
import { useDailyLogsApi } from "../api/dailyLogs";
import type { DailyLog, DailyLogUpsert } from "../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function useTodayLog() {
  const api = useDailyLogsApi();
  const [data, setData] = useState<DailyLog | null>(null);
  const [placeholder, setPlaceholder] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const savingRef = useRef<Set<string>>(new Set());

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [todayLog, yesterdayLog] = await Promise.all([
        api.getDailyLog(today()),
        api.getDailyLog(yesterday()),
      ]);
      setData(todayLog);
      setPlaceholder(yesterdayLog);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const saveField = useCallback(async (field: keyof DailyLogUpsert, value: number | null) => {
    const fieldKey = String(field);
    if (savingRef.current.has(fieldKey)) return;
    savingRef.current.add(fieldKey);

    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
    setSaveError(null);

    const previous = data;
    setData((prev) =>
      prev ? { ...prev, [field]: value ?? null } : { date: today(), weight_kg: null, calories: null, protein_g: null, sleep_hours: null, [field]: value ?? null },
    );

    try {
      await api.upsertDailyLog(today(), { [field]: value ?? null });
    } catch (err) {
      setData(previous);
      const message = err instanceof Error ? err.message : "Save failed";
      setFieldErrors((prev) => ({ ...prev, [fieldKey]: message }));
      setSaveError(message);
    } finally {
      savingRef.current.delete(fieldKey);
    }
  }, [data, api]);

  return {
    data,
    placeholder,
    loading,
    error,
    saveError,
    fieldErrors,
    saveField,
    refetch: fetch,
  };
}
