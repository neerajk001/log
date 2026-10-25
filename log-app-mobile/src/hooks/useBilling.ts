import { useCallback, useEffect, useRef, useState } from "react";
import { useBillingApi } from "../api/billing";
import { useDataSync } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { BillingStatus } from "../api/types";

/**
 * Entitlement + AI-usage snapshot for the paywall and the "N left" hints.
 *
 * Mirrors `useMe`: gated on sign-in, generation-guarded so a slow response can't
 * overwrite a newer one, and resubscribed to the `billing` resource so any AI
 * write that spends quota refreshes the counters.
 */
export function useBilling(enabled = true) {
  const api = useBillingApi();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();
  const enabledRef = useRef(enabled);

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const next = await api.getStatus();
      if (!isCurrent(token)) return;
      setStatus(next);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load your plan");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, begin, isCurrent]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      // Signed out: drop the previous account's entitlement immediately.
      begin();
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }
    load();
  }, [load, enabled, begin]);

  const syncLoad = useCallback(() => {
    if (enabledRef.current) load();
  }, [load]);
  useDataSync(["billing"], syncLoad);

  return { status, loading, error, refetch: load };
}
