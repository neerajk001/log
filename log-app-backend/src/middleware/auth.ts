import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../db/client";

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

async function findOrCreateUserByClerkId(clerkUserId: string): Promise<string> {
  let user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { clerkUserId },
      select: { id: true },
    });
  }

  return user.id;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  let clerkUserId: string;

  try {
    const auth = getAuth(req);

    if (!auth.userId) {
      console.warn("[auth] Clerk did not authenticate request", {
        path: req.originalUrl,
        hasAuthorizationHeader: typeof req.headers.authorization === "string",
      });
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing or invalid authentication token" },
      });
      return;
    }

    clerkUserId = auth.userId;
  } catch (err) {
    console.warn("[auth] Clerk token verification failed", {
      path: req.originalUrl,
      hasAuthorizationHeader: typeof req.headers.authorization === "string",
      message: err instanceof Error ? err.message : "Unknown auth error",
    });
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
    return;
  }

  try {
    const userId = await findOrCreateUserByClerkId(clerkUserId);
    req.userId = userId;
    next();
  } catch (err) {
    console.error("[auth] Failed to resolve local user", {
      path: req.originalUrl,
      message: err instanceof Error ? err.message : "Unknown database error",
    });
    next(err);
  }
}
