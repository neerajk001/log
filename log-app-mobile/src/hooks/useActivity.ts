import { useCallback, useState } from "react";
import { useActivityApi } from "../api/activity";
import { useDataSyncOnFocus } from "./useDataSync";
import type { ActivityLog, ActivityLogCreate } from "../api/types";

/** Activity logs for a single date, with optimistic add/delete. */
export function useActivity(date: string) {
  const api = useActivityApi();
  const [entries, setEntries] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await api.getActivityRange(date, date));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [api, date]);

  useDataSyncOnFocus(["activity"], load);

  const addEntry = useCallback(
    async (data: ActivityLogCreate) => {
      setError(null);
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: ActivityLog = {
        id: tempId,
        date: data.date,
        activity_type: data.activity_type,
        name: data.name,
        duration_min: data.duration_min,
        distance_km: data.distance_km ?? null,
        calories_burned: data.calories_burned ?? null,
        notes: data.notes ?? null,
      };
      setEntries((prev) => [optimistic, ...prev]);
      try {
        const saved = await api.createActivity(data);
        setEntries((prev) => prev.map((e) => (e.id === tempId ? saved : e)));
        return saved;
      } catch (err) {
        setEntries((prev) => prev.filter((e) => e.id !== tempId));
        const message = err instanceof Error ? err.message : "Failed to save activity";
        setError(message);
        throw err;
      }
    },
    [api],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      if (id.startsWith("pending-")) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        return;
      }
      const removed = entries.find((e) => e.id === id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      try {
        await api.deleteActivity(id);
      } catch (err) {
        if (removed) setEntries((prev) => [removed, ...prev]);
        setError(err instanceof Error ? err.message : "Failed to delete activity");
        throw err;
      }
    },
    [api, entries],
  );

  return { entries, loading, error, addEntry, deleteEntry, refetch: load };
}
