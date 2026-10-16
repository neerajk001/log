import { describe, expect, it, vi, afterEach } from "vitest";
import { buildPoolOptions, keepaliveMs } from "../src/db/client";

describe("buildPoolOptions", () => {
  it("sizes past the coach context's concurrent fan-out with fail-fast connects", () => {
    const opts = buildPoolOptions();
    // ~13 concurrent queries (12 context + history) vs the pg default of 10.
    expect(opts.max).toBe(20);
    // pg default is 0 (wait forever): a stuck connect must fail, not hang.
    expect(opts.connectionTimeoutMillis).toBe(10_000);
    expect(opts.idleTimeoutMillis).toBe(10_000);
    expect(opts.keepAlive).toBe(true);
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
