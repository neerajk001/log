import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { subscribeResources, type Resource } from "../api/cache";

/**
 * Subscribes a data hook to cache invalidations: when a mutation anywhere drops
 * one of `resources`, `load` runs again — so a plan the coach changed lands on the
 * Plan tab without a manual refresh. `load` is held in a ref, so callers can pass
 * a fresh closure each render without re-subscribing.
 */
export function useDataSync(resources: readonly Resource[], load: () => void): void {
  // Depend on the resource names, not the array identity (callers pass literals).
  const key = resources.join(",");
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(
    () => subscribeResources(key ? (key.split(",") as Resource[]) : [], () => loadRef.current()),
    [key],
  );
}

/**
 * `useDataSync` plus a refetch whenever the screen regains focus — the fix for
 * hooks that otherwise fetched on mount only.
 *
 * Also re-runs whenever `load`'s identity changes, which is how a hook reacts to
 * its own inputs (a new date, range or window): without this, changing the range
 * on Insights left the charts on the old data. Each call reads the GET cache
 * first, so an unchanged resource costs no request.
 */
export function useDataSyncOnFocus(resources: readonly Resource[], load: () => void): void {
  useDataSync(resources, load);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    loadRef.current();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      loadRef.current();
    }, []),
  );
}
