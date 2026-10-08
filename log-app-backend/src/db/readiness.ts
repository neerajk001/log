import { prisma } from "./client";

export async function checkDatabaseReadiness(
  query: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`,
  timeoutMs = 3000,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      query(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Database readiness timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
