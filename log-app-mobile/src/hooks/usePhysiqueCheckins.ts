import { useCallback, useState } from "react";
import { useCoachApi } from "../api/coach";
import { useDataSyncOnFocus } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { PhysiqueCheckin } from "../api/types";

/**
 * The athlete's stored weekly check-ins. The image bytes never travel in this
 * payload — only metadata and the coach's read.
 */
export function usePhysiqueCheckins() {
  const api = useCoachApi();
  const [checkins, setCheckins] = useState<PhysiqueCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  const load = useCallback(async (force = false) => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listPhysiqueCheckins({ force });
      if (!isCurrent(token)) return;
      setCheckins(rows);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load check-ins");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, begin, isCurrent]);

  useDataSyncOnFocus(["coach"], load);

  const remove = useCallback(
    async (id: string) => {
      const previous = checkins;
      setCheckins((current) => current.filter((row) => row.id !== id));
      try {
        await api.deletePhysiqueCheckin(id);
      } catch (err) {
        setCheckins(previous);
        throw err;
      }
    },
    [api, checkins],
  );

  const removeAll = useCallback(async () => {
    const previous = checkins;
    setCheckins([]);
    try {
      await api.deleteAllPhysiqueCheckins();
    } catch (err) {
      setCheckins(previous);
      throw err;
    }
  }, [api, checkins]);

  return { checkins, loading, error, refetch: load, remove, removeAll };
}
