import { useMemo } from "react";
import { useApiClient } from "./client";
import type { UserProfile } from "./types";

export function useMeApi() {
  const client = useApiClient();

  return useMemo(() => ({
    getMe: () => client.get<UserProfile>("/api/me"),
    updateMe: (data: { protein_target_g?: number | null; calorie_target?: number | null }) =>
      client.put<UserProfile>("/api/me", data),
  }), [client]);
}
