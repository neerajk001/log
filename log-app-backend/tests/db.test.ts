import { describe, expect, it, vi, afterEach } from "vitest";
import { buildPoolOptions, keepaliveMs, poolMax } from "../src/db/client";

describe("buildPoolOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sizes past the coach context's concurrent fan-out with fail-fast connects", () => {
    // The local .env may point at a Supabase pooler with a lower cap.
    vi.stubEnv("DB_POOL_MAX", "");
    const opts = buildPoolOptions();
    // ~13 concurrent queries (12 context + history) vs the pg default of 10.
    expect(opts.max).toBe(20);
    // pg default is 0 (wait forever): a stuck connect must fail, not hang.
    expect(opts.connectionTimeoutMillis).toBe(10_000);
    expect(opts.idleTimeoutMillis).toBe(10_000);
    expect(opts.keepAlive).toBe(true);
    // Probe for dead peers after ~10s instead of the OS default (hours).
    expect(opts.keepAliveInitialDelayMillis).toBe(10_000);
    // Lets operators (and the integration suite) identify this app's backends.
    expect(opts.application_name).toBe("log-app-backend");
  });
});

describe("poolMax", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 20 and honours a lower ceiling for poolers that cap connections", () => {
    vi.stubEnv("DB_POOL_MAX", "");
    expect(poolMax()).toBe(20);
    vi.stubEnv("DB_POOL_MAX", "10");
    expect(poolMax()).toBe(10);
    vi.stubEnv("DB_POOL_MAX", "0");
    expect(poolMax()).toBe(20);
    vi.stubEnv("DB_POOL_MAX", "soon");
    expect(poolMax()).toBe(20);
  });
});

describe("keepaliveMs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults under Neon's 5-minute suspend", () => {
    vi.stubEnv("DB_KEEPALIVE_MS", "");
    expect(keepaliveMs()).toBe(4 * 60 * 1000);
  });

  it("honours an override and treats 0/garbage as off", () => {
    vi.stubEnv("DB_KEEPALIVE_MS", "60000");
    expect(keepaliveMs()).toBe(60000);
    vi.stubEnv("DB_KEEPALIVE_MS", "0");
    expect(keepaliveMs()).toBe(0);
    vi.stubEnv("DB_KEEPALIVE_MS", "soon");
    expect(keepaliveMs()).toBe(0);
  });
});
