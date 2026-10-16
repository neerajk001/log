import { useCallback, useState } from "react";
import { useDailyLogsApi } from "../api/dailyLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import { useLatest } from "./useLatest";
import { addDays } from "../utils/date";
import type { DailyLog } from "../api/types";

export interface DailyComparison {
  /** Latest weigh-in this week minus the last one in the week before (kg). */
  weightDeltaKg: number | null;
  /** Mean sleep of completed days this week minus last week (whole hours). */
  sleepDeltaHours: number | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Latest dated row with a weight, so an unsorted range still yields the newest. */
function latestWeight(rows: DailyLog[]): number | null {
  let newest: DailyLog | null = null;
  for (const row of rows) {
    if (row.weight_kg == null) continue;
    if (newest == null || row.date > newest.date) newest = row;
  }
  return newest?.weight_kg ?? null;
}

/**
 * Week-over-week deltas for the Today tiles, derived client-side from a two-week
 * daily-log read. Averages use completed days only (today is excluded), so a
 * half-finished day never drags the comparison.
 */
export function useDailyComparison(today: string): DailyComparison {
  const api = useDailyLogsApi();
  const [data, setData] = useState<DailyComparison>({ weightDeltaKg: null, sleepDeltaHours: null });
  const { begin, isCurrent } = useLatest();

  const load = useCallback(async () => {
    const token = begin();
    try {
      const rows = await api.getDailyLogsRange(addDays(today, -13), today);
      if (!isCurrent(token)) return;
      const weekStart = addDays(today, -6);
      const thisWeek = rows.filter((r) => r.date >= weekStart && r.date <= today);
      const lastWeek = rows.filter((r) => r.date < weekStart);

      const thisWeight = latestWeight(thisWeek);
      const lastWeight = latestWeight(lastWeek);
      const weightDeltaKg =
        thisWeight != null && lastWeight != null
          ? Math.round((thisWeight - lastWeight) * 10) / 10
          : null;

      const spentSleep = (rows: DailyLog[]) =>
        average(rows.filter((r) => r.sleep_hours != null).map((r) => r.sleep_hours as number));
      const thisSleep = spentSleep(thisWeek.filter((r) => r.date < today));
      const lastSleep = spentSleep(lastWeek);
      const sleepDeltaHours =
        thisSleep != null && lastSleep != null ? Math.round(thisSleep - lastSleep) : null;

      setData({ weightDeltaKg, sleepDeltaHours });
    } catch {
      // Footnotes are non-critical: keep the last good values on a blip.
    }
  }, [api, today, begin, isCurrent]);

  useDataSyncOnFocus(["daily"], load);

  return data;
}
