import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { installPrePing, prePingIdleMs, prePingTimeoutMs } from "../src/db/prePing";

interface FakeClient {
  id: string;
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

function makeClient(id: string): FakeClient {
  return { id, query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
}

/** Minimal pool double: a queue of clients + captured `release` listeners. */
function makePool(queue: FakeClient[]) {
  const releaseHandlers: ((err: Error, client: PoolClient) => void)[] = [];
  const pool = {
    on: vi.fn((event: string, handler: (err: Error, client: PoolClient) => void) => {
      if (event === "release") releaseHandlers.push(handler);
      return pool;
    }),
    connect: vi.fn(async () => queue.shift() as unknown as PoolClient),
    emitRelease(client: FakeClient, err: null | Error = null) {
      for (const handler of releaseHandlers) handler(err as Error, client as unknown as PoolClient);
    },
  };
  return pool;
}

const connect = (pool: ReturnType<typeof makePool>) =>
  (pool.connect as unknown as () => Promise<FakeClient>)();

describe("installPrePing", () => {
  it("never pings a fresh connection", async () => {
    const client = makeClient("a");
    const pool = makePool([client]);
    const ping = vi.fn(async () => ({}));
    let now = 1_000;

    installPrePing(pool as unknown as Pool, { idleMs: 1_000, timeoutMs: 100, now: () => now, ping });

    expect(await connect(pool)).toBe(client);
    expect(ping).not.toHaveBeenCalled();
  });

  it("pings a connection idle beyond the window and keeps it when healthy", async () => {
    const client = makeClient("a");
    const pool = makePool([client]);
    const ping = vi.fn(async () => ({}));
    let now = 1_000;

    installPrePing(pool as unknown as Pool, { idleMs: 1_000, timeoutMs: 100, now: () => now, ping });
    pool.emitRelease(client); // idle clock starts on release
    now = 2_500;

    expect(await connect(pool)).toBe(client);
    expect(ping).toHaveBeenCalledWith(client);
    expect(client.release).not.toHaveBeenCalled();
  });

  it("skips the ping for a connection used recently", async () => {
    const client = makeClient("a");
    const pool = makePool([client]);
    const ping = vi.fn(async () => ({}));
    let now = 1_000;

    installPrePing(pool as unknown as Pool, { idleMs: 1_000, timeoutMs: 100, now: () => now, ping });
    pool.emitRelease(client);
    now = 1_500;

    expect(await connect(pool)).toBe(client);
    expect(ping).not.toHaveBeenCalled();
  });

  it("destroys a connection whose ping fails and returns a fresh one", async () => {
    const dead = makeClient("dead");
    const fresh = makeClient("fresh");
    const pool = makePool([dead, fresh]);
    const ping = vi.fn(async (client: PoolClient) => {
      if ((client as unknown as FakeClient) === dead) throw new Error("socket closed");
      return {};
    });
    let now = 1_000;

    installPrePing(pool as unknown as Pool, { idleMs: 100, timeoutMs: 100, now: () => now, ping });
    pool.emitRelease(dead);
    now = 5_000;

    expect(await connect(pool)).toBe(fresh);
    expect(dead.release).toHaveBeenCalledTimes(1);
    expect((dead.release.mock.calls[0][0] as Error).message).toContain("unhealthy");
  });

  it("treats a hung ping as death after the timeout", async () => {
    const dead = makeClient("dead");
    const fresh = makeClient("fresh");
    const pool = makePool([dead, fresh]);
    const ping = vi.fn((client: PoolClient) =>
      (client as unknown as FakeClient) === dead
        ? new Promise(() => {})
        : Promise.resolve({}),
    );
    let now = 1_000;

    installPrePing(pool as unknown as Pool, { idleMs: 10, timeoutMs: 10, now: () => now, ping });
    pool.emitRelease(dead);
    now = 5_000;

    expect(await connect(pool)).toBe(fresh);
    expect(dead.release).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt limit instead of looping forever", async () => {
    const dead1 = makeClient("dead-1");
    const dead2 = makeClient("dead-2");
    const pool = makePool([dead1, dead2]);
    let now = 1_000;

    installPrePing(pool as unknown as Pool, {
      idleMs: 10,
      timeoutMs: 50,
      maxAttempts: 2,
      now: () => now,
      ping: async () => {
        throw new Error("socket closed");
      },
    });
    pool.emitRelease(dead1);
    pool.emitRelease(dead2);
    now = 5_000;

    await expect(connect(pool)).rejects.toThrow(/no healthy database connection/i);
    expect(dead1.release).toHaveBeenCalled();
    expect(dead2.release).toHaveBeenCalled();
  });

  it("supports the callback acquire path used by pool.query", async () => {
    const client = makeClient("a");
    const pool = makePool([client]);
    let now = 1_000;
    installPrePing(pool as unknown as Pool, {
      idleMs: 1_000,
      timeoutMs: 100,
      now: () => now,
      ping: async () => ({}),
    });

    const acquired = await new Promise<{ client: FakeClient; done: () => void }>(
      (resolve, reject) => {
        (pool.connect as unknown as (cb: unknown) => void)(
          (err: Error | null, got?: PoolClient, done?: (releaseErr?: unknown) => void) => {
            if (err) reject(err);
            else resolve({ client: got as unknown as FakeClient, done: () => done?.() });
          },
        );
      },
    );

    expect(acquired.client).toBe(client);
    acquired.done();
    expect(client.release).toHaveBeenCalled();
  });

  it("does nothing when disabled with idleMs 0", async () => {
    const client = makeClient("a");
    const pool = makePool([client]);
    const originalConnect = pool.connect;
    const ping = vi.fn();

    installPrePing(pool as unknown as Pool, { idleMs: 0, timeoutMs: 100, ping });

    expect(pool.connect).toBe(originalConnect);
    expect(await connect(pool)).toBe(client);
    expect(ping).not.toHaveBeenCalled();
  });
});

describe("prePing config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to a 20s idle window and a 5s ping timeout", () => {
    vi.stubEnv("DB_PRE_PING_MS", "");
    vi.stubEnv("DB_PRE_PING_TIMEOUT_MS", "");
    expect(prePingIdleMs()).toBe(20_000);
    expect(prePingTimeoutMs()).toBe(5_000);
  });

  it("honours overrides, treats 0 as disabled and garbage as the default", () => {
    vi.stubEnv("DB_PRE_PING_MS", "500");
    expect(prePingIdleMs()).toBe(500);
    vi.stubEnv("DB_PRE_PING_MS", "0");
    expect(prePingIdleMs()).toBe(0);
    vi.stubEnv("DB_PRE_PING_MS", "soon");
    expect(prePingIdleMs()).toBe(20_000);

    vi.stubEnv("DB_PRE_PING_TIMEOUT_MS", "1500");
    expect(prePingTimeoutMs()).toBe(1500);
    vi.stubEnv("DB_PRE_PING_TIMEOUT_MS", "0");
    expect(prePingTimeoutMs()).toBe(5_000);
  });
});
