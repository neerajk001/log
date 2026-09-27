import { useMemo } from "react";
import { useApiClient } from "./client";
import type { ActivityLog, ActivityLogCreate } from "./types";

export function useActivityApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      getActivityRange: (from: string, to: string) =>
        client.get<ActivityLog[]>(`/api/logs/activity?from=${from}&to=${to}`),
      createActivity: (data: ActivityLogCreate) =>
        client.post<ActivityLog>("/api/logs/activity", data),
      deleteActivity: (id: string) => client.del<{ ok: true }>(`/api/logs/activity/${id}`),
    }),
    [client],
  );
}
