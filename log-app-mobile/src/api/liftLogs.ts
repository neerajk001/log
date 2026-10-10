import { useMemo } from "react";
import { useApiClient } from "./client";
import type { LiftLog, LiftLogCreate } from "./types";

export function useLiftLogsApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      createLiftLog: (data: LiftLogCreate) => client.post<LiftLog>("/api/logs/lift", data),
      /** The Next.js API accepts `exercise`, or a `from`/`to` range. */
      getLiftLogsRange: (from: string, to: string) =>
        client.get<LiftLog[]>(`/api/logs/lift?from=${from}&to=${to}`),
      deleteLiftLog: (id: string) => client.del<{ ok: true }>(`/api/logs/lift/${id}`),
    }),
    [client],
  );
}
