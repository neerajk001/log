import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolConfig } from "pg";
import { config } from "../config";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

export function buildPoolSslConfig(
  databaseUrl: string,
  sslNoVerify = false,
): PoolConfig["ssl"] {
  let sslmode: string | null = null;
  try {
    sslmode = new URL(databaseUrl).searchParams.get("sslmode");
  } catch {
    sslmode = null;
  }

  if (sslmode === "disable") return false;
  if (sslmode === "no-verify" || sslNoVerify) {
    console.warn(
      "[db] Postgres TLS verification is DISABLED. Local dev only — never use in production.",
    );
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

export function assertDbSslAllowed(
  ssl: PoolConfig["ssl"],
  nodeEnv = config.nodeEnv,
): void {
  const disabled =
    ssl === false ||
    (typeof ssl === "object" && ssl?.rejectUnauthorized === false);
  if (nodeEnv === "production" && disabled) {
    throw new Error(
      "Refusing to start with Postgres TLS verification disabled in production. Use sslmode=require and remove DATABASE_SSL_NO_VERIFY.",
    );
  }
}

const ssl = buildPoolSslConfig(config.database.url, config.database.sslNoVerify);
assertDbSslAllowed(ssl);

const pool = globalForPrisma.pgPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
});

const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}
