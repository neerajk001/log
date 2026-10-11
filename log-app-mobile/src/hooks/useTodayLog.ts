import { useCallback, useEffect, useRef, useState } from "react";
import { useDailyLogsApi } from "../api/dailyLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import type { DailyField, DailyLog } from "../api/types";
import { addDays, todayLocal } from "../utils/date";

function emptyLog(date: string): DailyLog {
  return { date, weight_kg: null, calories: null, protein_g: null, sleep_hours: null };
}

type DailyPatch = Partial<Record<DailyField, number | null>>;

/**
 * Daily log for a given date, with the previous day's values as placeholders.
 * Saves optimistically on blur and keeps a retry affordance on failure (Next.js R2.4).
 *
 * Several fields can be saved as one queued PUT, so repeating three locked
 * defaults costs one request instead of three.
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
    try {
      // One range read covers the day and the day before it.
      const rows = await api.getDailyLogsRange(addDays(activeDate, -1), activeDate);
      if (dateRef.current !== myDate) return;
      setData(rows.find((row) => row.date === activeDate) ?? emptyLog(activeDate));
      setPlaceholder(rows.find((row) => row.date === addDays(activeDate, -1)) ?? null);
    } catch (err) {
      if (dateRef.current !== myDate) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (dateRef.current === myDate) setLoading(false);
    }
  }, [api, activeDate]);

  useDataSyncOnFocus(["daily"], load);

  const saveMany = useCallback(
    async (patch: DailyPatch) => {
      const entries = Object.entries(patch) as [DailyField, number | null][];
      if (entries.length === 0) return;

      const run = saveQueueRef.current.then(async () => {
        if (dateRef.current !== activeDate) return;
        const clearFields = <T,>(record: Record<string, T>): Record<string, T> => {
          const next = { ...record };
          for (const [field] of entries) delete next[field];
          return next;
        };

        setFieldErrors(clearFields);
        setData((cur) => {
          const next = { ...(cur ?? emptyLog(activeDate)) };
          for (const [field, value] of entries) next[field] = value;
          return next;
        });

        try {
          const saved = await api.upsertDailyLog(activeDate, patch);
          if (dateRef.current !== activeDate) return;
          setData((cur) => ({ ...(cur ?? emptyLog(activeDate)), ...saved }));
          setRetries(clearFields);
        } catch (err) {
          if (dateRef.current !== activeDate) return;
          const message = err instanceof Error ? err.message : "Save failed";
          setFieldErrors((prev) => ({
            ...prev,
            ...Object.fromEntries(entries.map(([field]) => [field, message])),
          }));
          setRetries((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
          try {
            const fresh = await api.getDailyLog(activeDate);
            if (dateRef.current === activeDate && fresh) {
              // Re-apply what was typed on top of the server read, so the screen
              // matches "your entry is kept" and the retry above.
              const restored = { ...fresh };
              for (const [field, value] of entries) restored[field] = value;
              setData(restored);
            }
          } catch {
            // the pending values are already on screen and queued for retry
          }
        }
      });

      saveQueueRef.current = run.catch(() => {});
      await run;
    },
    [api, activeDate],
  );

  const save = useCallback((field: DailyField, value: number | null) => saveMany({ [field]: value }), [
    saveMany,
  ]);

  const retrySave = useCallback(
    async (field?: DailyField) => {
      const target = field ?? (Object.keys(retries)[0] as DailyField | undefined);
      if (!target) return;
      const value = retries[target];
      if (value !== undefined) await save(target, value);
    },
    [retries, save],
  );

  const retry =
    (Object.entries(retries) as [DailyField, number | null][]).map(([field, value]) => ({
      field,
      value,
    }))[0] ?? null;

  return {
    data,
    placeholder,
    loading,
    error,
    fieldErrors,
    retry,
    save,
    saveMany,
    retrySave,
    refetch: load,
    today: todayLocal(),
  };
}
