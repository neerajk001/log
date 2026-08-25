import { useMemo } from "react";
import { useApiClient } from "./client";
import type { DailyLog, DailyLogUpsert } from "./types";

export function useDailyLogsApi() {
  const client = useApiClient();

  return useMemo(() => ({
    getDailyLog: (date: string) => client.get<DailyLog>(`/api/logs/daily/${date}`),
    upsertDailyLog: (date: string, patch: DailyLogUpsert) =>
      client.put<DailyLog>(`/api/logs/daily/${date}`, patch),
    getDailyLogsRange: (from: string, to: string) =>
      client.get<DailyLog[]>(`/api/logs/daily?from=${from}&to=${to}`),
  }), [client]);
}
