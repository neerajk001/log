/**
 * Phase 0 instrumentation: timing helpers + guarded analytics capture.
 *
 * Privacy contract — captured properties are durations, counts and route/screen
 * names only. Never pass message text, prompts, tokens, emails or user ids.
 * Everything no-ops when analytics are unconfigured, and never throws: telemetry
 * must not break the flow it measures.
 */

export function now(): number {
  return Date.now();
}

export function elapsedMs(t0: number): number {
  return Date.now() - t0;
}

/** Analytics key present (compiled into the build)? */
export function isAnalyticsEnabled(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_POSTHOG_API_KEY);
}

/** Duration/count-only event. Silent when unconfigured; never throws. */
export function captureTiming(
  posthog: unknown,
  event: string,
  props: Record<string, number | string>,
): void {
  try {
    if (!isAnalyticsEnabled()) return;
    // Method shorthand keeps this bivariant: any capture(event, props?) shape fits.
    const client = posthog as { capture?(event: string, props?: unknown): void } | null | undefined;
    client?.capture?.(event, props);
  } catch {
    // telemetry must not break the measured flow
  }
}
