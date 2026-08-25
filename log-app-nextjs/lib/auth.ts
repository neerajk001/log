import { prisma } from '@/lib/db/client';

/**
 * Resolve the local application user from a verified Clerk user id.
 * Provisions a row on first login (R1.3). Returns the local `users.id`,
 * never the raw Clerk id.
 */
export async function findOrCreateUser(clerkUserId: string) {
  const existing = await prisma.user.findUnique({ where: { clerkUserId } });
  if (existing) return existing;
  return prisma.user.create({ data: { clerkUserId } });
}
