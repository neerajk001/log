import { useCallback, useRef } from "react";

/**
 * Request-generation guard for async loads. Each `begin()` claims the newest
 * token; only that token may commit its result. A slow response for an old
 * range/date can no longer overwrite the newer one when it lands late.
 */
export function useLatest() {
  const latestRef = useRef(0);
  const begin = useCallback(() => {
    latestRef.current += 1;
    return latestRef.current;
  }, []);
  const isCurrent = useCallback((token: number) => token === latestRef.current, []);
  return { begin, isCurrent };
}
