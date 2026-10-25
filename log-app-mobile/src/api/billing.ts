import { useMemo } from "react";
import { useApiClient } from "./client";
import type { BillingStatus, DevPlanMode } from "./types";

export function useBillingApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      getStatus: () => client.get<BillingStatus>("/api/billing/status"),
      /** Dev builds only — the server 404s this in production. */
      simulatePlan: (mode: DevPlanMode) =>
        client.post<BillingStatus>("/api/billing/dev/simulate", { mode }),
    }),
    [client],
  );
}
