import { useMemo } from "react";
import { useApiClient } from "./client";
import type {
  LiftLog,
  LiftLogCreate,
  LiftLogUpdate,
  LiftMetrics,
  LiftSummary,
} from "./types";

export function useLiftLogsApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      createLiftLog: (data: LiftLogCreate) => client.post<LiftLog>("/api/logs/lift", data),
      /** The Next.js API accepts `exercise`, or a `from`/`to` range. */
      getLiftLogsRange: (from: string, to: string) =>
        client.get<LiftLog[]>(`/api/logs/lift?from=${from}&to=${to}`),
      /** Recent exercise names + each one's last session — one small read. */
      getLiftSummary: (days: number, before: string) =>
        client.get<LiftSummary>(`/api/logs/lift/summary?days=${days}&before=${before}`),
      /** Insights: per-day counts and per-exercise rollups, not raw sets. */
      getLiftMetrics: (from: string, to: string, prevFrom: string, prevTo: string) =>
        client.get<LiftMetrics>(
          `/api/logs/lift/metrics?from=${from}&to=${to}&prev_from=${prevFrom}&prev_to=${prevTo}`,
        ),
      deleteLiftLog: (id: string) => client.del<{ ok: true }>(`/api/logs/lift/${id}`),
      updateLiftLog: (id: string, data: LiftLogUpdate) =>
        client.put<LiftLog>(`/api/logs/lift/${id}`, data),
    }),
    [client],
  );
}
