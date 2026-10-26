import { NextFunction, Request, Response } from "express";
import { prisma } from "../db/client";
import { AppError } from "./errorHandler";
import { consumeQuota, isPro, type Feature } from "../services/entitlements";

/**
 * Enforces the free-tier AI allowance for one feature.
 *
 * Must run AFTER `requireAuth` (it reads `req.userId`) and AFTER the endpoint's
 * rate limiter, so a request rejected for abuse never burns a unit of quota.
 * Pro and active-trial accounts pass through without writing a usage row.
 */
export function requireFeature(feature: Feature) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { planTier: true, trialEndsAt: true, proUntil: true },
      });

      if (!user) {
        next(new AppError(401, "UNAUTHORIZED", "Account not found. Please sign in again."));
        return;
      }

      if (isPro(user)) {
        next();
        return;
      }

      await consumeQuota(req.userId, feature);
      next();
    } catch (err) {
      next(err);
    }
  };
}

