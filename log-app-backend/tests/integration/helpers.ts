import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { describe } from "vitest";

/** Load the repo .env without overriding explicit process env (dotenv default). */
const loaded = dotenv.config().parsed ?? {};

export const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
const appDatabaseUrl = process.env.DATABASE_URL ?? loaded.DATABASE_URL ?? "";

if (testDatabaseUrl && appDatabaseUrl && testDatabaseUrl === appDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL points at the application database — integration tests must use a scratch database.",
  );
}
if (process.env.VITEST_REQUIRE_DB === "1" && !testDatabaseUrl) {
  // CI sets this so the suite can never silently skip the DB tests.
  throw new Error("VITEST_REQUIRE_DB=1 but TEST_DATABASE_URL is not set.");
}

// Point the app's Prisma client at the scratch database before anything imports
// `src/config` (dotenv above does not override explicit env vars). Without a test
// URL the app module is never imported — integration tests skip.
if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
  // Deterministic connection protection: ping every reuse so a deliberately
  // terminated pooled connection is always caught at checkout (not a timing race).
  process.env.DB_PRE_PING_MS = process.env.DB_PRE_PING_MS ?? "1";
}

/** describe that skips (instead of failing) with no test database configured. */
export const describeDb = testDatabaseUrl ? describe : describe.skip;

export interface TestApp {
  base: string;
  close: () => Promise<void>;
}

/** Boots the real Express app (real routes/services/Prisma) on an ephemeral port. */
export async function bootTestApp(): Promise<TestApp> {
  const { default: app } = await import("../../src/app");
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("test app has no port");
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export async function testPrisma() {
  const { prisma } = await import("../../src/db/client");
  return prisma;
}

/** A real users row; unique per call so tests never collide. */
export async function createUser(label: string): Promise<string> {
  const prisma = await testPrisma();
  const user = await prisma.user.create({
    data: { clerkUserId: `test-${label}-${randomUUID()}` },
    select: { id: true },
  });
  return user.id;
}

/**
 * fetch bound to the test app, carrying the header the mocked `requireAuth`
 * maps to `req.userId` (that is the only thing mocked — routes, services,
 * validation and Prisma are the real article).
 */
export function asUser(app: TestApp, userId: string) {
  return (path: string, init: RequestInit = {}) =>
    fetch(`${app.base}${path}`, {
      ...init,
      headers: {
        ...(init.body != null ? { "content-type": "application/json" } : {}),
        ...(init.headers as Record<string, string> | undefined),
        "x-test-user-id": userId,
      },
    });
}

/** Wipes all data on the scratch database (all tables cascade from users). */
export async function truncateAll(): Promise<void> {
  const prisma = await testPrisma();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
}
