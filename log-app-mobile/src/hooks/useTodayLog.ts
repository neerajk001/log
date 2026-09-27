import { useCallback, useEffect, useRef, useState } from "react";
import { useDailyLogsApi } from "../api/dailyLogs";
import type { DailyField, DailyLog } from "../api/types";
import { addDays, todayLocal } from "../utils/date";

function emptyLog(date: string): DailyLog {
  return { date, weight_kg: null, calories: null, protein_g: null, sleep_hours: null };
}

/**
 * Daily log for a given date, with the previous day's values as placeholders.
 * Saves optimistically on blur and keeps a retry affordance on failure
 * (Next.js R2.4).
 */
export function useTodayLog(activeDate: string) {
  const api = useDailyLogsApi();
  const [data, setData] = useState<DailyLog | null>(null);
  const [placeholder, setPlaceholder] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [retries, setRetries] = useState<Record<string, number | null>>({});

  const dateRef = useRef(activeDate);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Mirror the prop into the ref in an effect (never during render) so the
  // React Compiler can optimize this hook.
  useEffect(() => {
    dateRef.current = activeDate;
  }, [activeDate]);

  const load = useCallback(async () => {
    const myDate = dateRef.current;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    try {
      const [current, previous] = await Promise.all([
        api.getDailyLog(activeDate),
        api.getDailyLog(addDays(activeDate, -1)),
      ]);
      if (controller.signal.aborted || dateRef.current !== myDate) return;
      setData(current ?? emptyLog(activeDate));
      setPlaceholder(previous);
    } catch (err) {
      if (dateRef.current !== myDate) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (dateRef.current === myDate) setLoading(false);
    }
    return () => controller.abort();
  }, [api, activeDate]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (field: DailyField, value: number | null) => {
      const run = saveQueueRef.current.then(async () => {
        if (dateRef.current !== activeDate) return;
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
        setData((cur) => ({ ...(cur ?? emptyLog(activeDate)), [field]: value }));

        try {
          const saved = await api.upsertDailyLog(activeDate, { [field]: value });
          if (dateRef.current !== activeDate) return;
          setData((cur) => ({ ...(cur ?? emptyLog(activeDate)), [field]: saved[field] }));
          setRetries((prev) => {
            const next = { ...prev };
            delete next[field];
            return next;
          });
        } catch (err) {
          if (dateRef.current !== activeDate) return;
          const message = err instanceof Error ? err.message : "Save failed";
          setFieldErrors((prev) => ({ ...prev, [field]: message }));
          setRetries((prev) => ({ ...prev, [field]: value }));
          try {
            const fresh = await api.getDailyLog(activeDate);
            if (dateRef.current === activeDate && fresh) setData(fresh);
          } catch {}
        }
      });
      saveQueueRef.current = run.catch(() => {});
      await run;
    },
    [api, activeDate],
  );

  const retrySave = useCallback(
    async (field?: DailyField) => {
      const target =
        field ?? (Object.keys(retries)[0] as DailyField | undefined);
      if (!target) return;
      const value = retries[target];
      if (value !== undefined) await save(target, value);
    },
    [retries, save],
  );

  const retry = (
    Object.entries(retries) as [DailyField, number | null][]
  ).map(([field, value]) => ({ field, value }))[0] ?? null;

  return {
    data,
    placeholder,
    loading,
    error,
    fieldErrors,
    retry,
    save,
    retrySave,
    refetch: load,
    today: todayLocal(),
  };
}
