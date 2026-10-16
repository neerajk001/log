import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import * as Sentry from "@sentry/node";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

/**
 * Short-lived clerkUserId → userId cache (perf audit §14).
 *
 * Safe because the mapping is immutable: `clerkUserId` is unique, internal ids
 * never change, and there is no user-delete path — a cached entry cannot go
 * stale within its 60s life (bounded size, oldest-first eviction). This removes
 * the measured ~250ms auth DB lookup from the hot path of every request; a miss
 * simply falls through to the database exactly as before.
 */
const AUTH_CACHE_MS = 60_000;
const MAX_AUTH_CACHE_ENTRIES = 2000;
const authCache = new Map<string, { userId: string; at: number }>();

function cacheAuth(clerkUserId: string, userId: string): void {
  if (authCache.size >= MAX_AUTH_CACHE_ENTRIES) {
    const oldest = authCache.keys().next();
    if (!oldest.done) authCache.delete(oldest.value);
  }
  authCache.set(clerkUserId, { userId, at: Date.now() });
}

function cachedAuth(clerkUserId: string): string | null {
  const hit = authCache.get(clerkUserId);
  if (!hit) return null;
  if (Date.now() - hit.at >= AUTH_CACHE_MS) {
    authCache.delete(clerkUserId);
    return null;
  }
  return hit.userId;
}

export async function findOrCreateUserByClerkId(clerkUserId: string): Promise<string> {
  const cached = cachedAuth(clerkUserId);
  if (cached) return cached;

  let user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!user) {
    try {
      user = await prisma.user.create({
        data: { clerkUserId },
        select: { id: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        user = await prisma.user.findUniqueOrThrow({
          where: { clerkUserId },
          select: { id: true },
        });
      } else {
        throw err;
      }
    }
  }

  cacheAuth(clerkUserId, user.id);
  return user.id;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  let clerkUserId: string;

  try {
    const auth = getAuth(req);

    if (!auth.userId) {
      console.warn("[auth] Unauthenticated request");
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing or invalid authentication token" },
      });
      return;
    }

    clerkUserId = auth.userId;
  } catch {
    console.warn("[auth] Token verification failed");
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
    return;
  }

  try {
    const userId = await findOrCreateUserByClerkId(clerkUserId);
    req.userId = userId;
    // Tags subsequent Sentry events on this request with the user.
    Sentry.getCurrentScope().setUser({ id: userId });
    next();
  } catch (err) {
    console.error("[auth] Failed to resolve local user", {
      path: req.path,
      name: err instanceof Error ? err.name : "UnknownError",
      prismaCode:
        err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined,
    });
    Sentry.getCurrentScope().setTag("operation", "auth.resolve_local_user");
    Sentry.getCurrentScope().setTag(
      "database.error_code",
      err instanceof Prisma.PrismaClientKnownRequestError ? err.code : "unknown",
    );
    next(err);
  }
}
