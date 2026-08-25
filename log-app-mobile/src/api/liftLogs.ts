import { useMemo } from "react";
import { useApiClient } from "./client";
import type { LiftLog, LiftLogCreate } from "./types";

export function useLiftLogsApi() {
  const client = useApiClient();

  return useMemo(() => ({
    createLiftLog: (data: LiftLogCreate) => client.post<LiftLog>("/api/logs/lift", data),
    getLiftLogsByDate: (date: string) =>
      client.get<LiftLog[]>(`/api/logs/lift?date=${date}`),
    getLiftLogs: (exercise: string, weeks?: number) => {
      const query = weeks
        ? `?exercise=${encodeURIComponent(exercise)}&weeks=${weeks}`
        : `?exercise=${encodeURIComponent(exercise)}`;
      return client.get<LiftLog[]>(`/api/logs/lift${query}`);
    },
  }), [client]);
}
