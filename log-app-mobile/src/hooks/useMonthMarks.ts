import { useCallback, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import { addDays, toIso } from "../utils/date";

/**
 * Which days in the visible calendar grid have a lift.
 *
 * Deliberately independent of the History time filter: browsing to an old month while
 * "Last 7 days" was selected used to show a completely unmarked calendar, which reads as
 * "nothing ever logged". The grid shows six weeks, so the window is padded either side of
 * the month to cover the spill-over cells.
 */
export function useMonthMarks(month: Date): Set<string> {
  const api = useLiftLogsApi();
  const [marked, setMarked] = useState<Set<string>>(new Set());

  const monthStart = toIso(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)));
  const monthEnd = toIso(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)));
  const gridFrom = addDays(monthStart, -6);
  const gridTo = addDays(monthEnd, 6);
  // The endpoint wants a comparison window; the marks only use the current one.
  const prevFrom = addDays(gridFrom, -43);
  const prevTo = addDays(gridFrom, -1);

  const load = useCallback(async () => {
    try {
      const metrics = await api.getLiftMetrics(gridFrom, gridTo, prevFrom, prevTo);
      setMarked(new Set(metrics.days.map((d) => d.date)));
    } catch {
      // Marks are a nicety — the list and the stats carry the screen.
    }
  }, [api, gridFrom, gridTo, prevFrom, prevTo]);

  useDataSyncOnFocus(["lift"], load);

  return marked;
}
