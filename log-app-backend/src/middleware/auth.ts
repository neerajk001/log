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

async function findOrCreateUserByClerkId(clerkUserId: string): Promise<string> {
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
    console.error("[auth] Failed to resolve local user");
    next(err);
  }
}
