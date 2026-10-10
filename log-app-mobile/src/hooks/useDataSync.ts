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
 * hooks that otherwise fetched on mount only. Safe to use *instead of* a mount
 * effect (the focus effect fires on mount too), and cheap: `load` reads the GET
 * cache first, so an unchanged resource costs no request.
 */
export function useDataSyncOnFocus(resources: readonly Resource[], load: () => void): void {
  useDataSync(resources, load);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      loadRef.current();
    }, []),
  );
}
