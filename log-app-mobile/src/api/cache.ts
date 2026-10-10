/**
 * Resource-aware GET cache. Entries are keyed by request path and tagged with the
 * resource they belong to, so a write drops only what it actually made stale
 * (see WRITE_EFFECTS) instead of clearing the whole cache.
 */

export type Resource =
  | "me"
  | "plans"
  | "lift"
  | "daily"
  | "activity"
  | "meals"
  | "trends"
  | "verdict"
  | "coach";

/** Checked in order, so `/api/meals` is matched before `/api/me`. */
const PATH_RESOURCES: readonly (readonly [string, Resource])[] = [
  ["/api/logs/lift", "lift"],
  ["/api/logs/daily", "daily"],
  ["/api/logs/activity", "activity"],
  ["/api/meals", "meals"],
  ["/api/plans", "plans"],
  ["/api/trends", "trends"],
  ["/api/verdict", "verdict"],
  ["/api/coach", "coach"],
  ["/api/me", "me"],
];

export function resourceForPath(path: string): Resource | null {
  for (const [prefix, resource] of PATH_RESOURCES) {
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) {
      return resource;
    }
  }
  return null;
}

/**
 * What a successful write to a resource makes stale. Logging a meal also moves
 * the day's calorie/protein totals (the server rolls them into `daily_logs`);
 * logging a set ticks off today's plan day; both feed trends and the verdict.
 */
const WRITE_EFFECTS: Record<Resource, readonly Resource[]> = {
  meals: ["meals", "daily", "trends", "verdict"],
  lift: ["lift", "plans", "trends", "verdict"],
  daily: ["daily", "trends", "verdict"],
  activity: ["activity"],
  plans: ["plans"],
  me: ["me"],
  trends: ["trends"],
  verdict: ["verdict"],
  coach: ["coach"],
};

/**
 * Invalidation is precise, so these can be generous: a stale entry only lives
 * until the next write to its resource. TTL is the safety net for changes made
 * elsewhere (another device, a server-side rollover).
 */
const RESOURCE_TTL_MS: Record<Resource, number> = {
  me: 300_000,
  plans: 300_000,
  coach: 300_000,
  trends: 120_000,
  verdict: 120_000,
  lift: 60_000,
  activity: 60_000,
  daily: 30_000,
  meals: 30_000,
};

const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 200;

interface CacheEntry {
  resource: Resource | null;
  expires: number;
  data: unknown;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const subscribers = new Set<{ resources: Set<Resource>; notify: () => void }>();

/** The default TTL for a path, derived from its resource. */
export function ttlForPath(path: string): number {
  const resource = resourceForPath(path);
  return resource ? RESOURCE_TTL_MS[resource] : DEFAULT_TTL_MS;
}

export function readCache<T>(path: string): T | undefined {
  const hit = cache.get(path);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(path);
    return undefined;
  }
  return hit.data as T;
}

export function writeCache(path: string, data: unknown, ttlMs?: number): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(path)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(path, {
    resource: resourceForPath(path),
    expires: Date.now() + (ttlMs ?? ttlForPath(path)),
    data,
  });
}

/** Keeps a GET from being fired twice while the first one is still open. */
export function trackInflight<T>(path: string, request: Promise<T>): Promise<T> {
  inflight.set(path, request);
  return request;
}

export function inflightFor(path: string): Promise<unknown> | undefined {
  return inflight.get(path);
}

export function clearInflight(path: string): void {
  inflight.delete(path);
}

export function subscribeResources(
  resources: readonly Resource[],
  notify: () => void,
): () => void {
  const subscriber = { resources: new Set(resources), notify };
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

/** Drops the affected resources' entries (and any in-flight reads of them). */
export function invalidateResources(resources: readonly Resource[]): void {
  if (resources.length === 0) return;
  const affected = new Set(resources);

  for (const [path, entry] of cache) {
    if (entry.resource === null || affected.has(entry.resource)) cache.delete(path);
  }
  for (const path of inflight.keys()) {
    const resource = resourceForPath(path);
    if (resource === null || affected.has(resource)) inflight.delete(path);
  }
  for (const subscriber of subscribers) {
    if ([...subscriber.resources].some((resource) => affected.has(resource))) {
      try {
        subscriber.notify();
      } catch {
        // a broken subscriber must not break the write that triggered it
      }
    }
  }
}

/** Called after every successful mutation. An unknown path clears everything. */
export function invalidateForWrite(path: string): void {
  const resource = resourceForPath(path);
  if (!resource) {
    clearAllCache();
    return;
  }
  invalidateResources(WRITE_EFFECTS[resource]);
}

export function clearAllCache(): void {
  cache.clear();
  inflight.clear();
}
