import { timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { config } from "../config";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import {
  billingSimulateSchema,
  revenueCatWebhookSchema,
  type DevPlanMode,
  type RevenueCatEvent,
} from "../validation/schemas";
import { getUsage, isOnTrial, isPro, trialDaysLeft } from "../services/entitlements";
import { processRevenueCatEvent } from "../services/revenueCat";

const router = Router();

/** Constant-time compare for the RevenueCat Authorization header. */
function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The dashboard's configured Authorization header value. RevenueCat may send it
 * verbatim or prefixed with "Bearer "; accept both. Missing config fails closed
 * so an unconfigured deployment never trusts an arbitrary caller.
 */
function verifyRevenueCatWebhook(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const secret = config.revenueCat.webhookSecret;
  if (!secret) {
    next(
      new AppError(
        503,
        "BILLING_WEBHOOK_UNAVAILABLE",
        "Store billing is not configured yet.",
      ),
    );
    return;
  }
  const provided = req.headers.authorization ?? "";
  if (!secureEqual(provided, secret) && !secureEqual(provided, `Bearer ${secret}`)) {
    next(new AppError(401, "UNAUTHORIZED", "Invalid webhook authorization"));
    return;
  }
  next();
}

/**
 * RevenueCat calls this directly (no Clerk token). Authorization is the shared
 * header value configured in the RevenueCat dashboard; delivery is idempotent
 * by event id. Always return 200 for a handled/duplicate event so RevenueCat
 * does not retry a successful delivery.
 */
router.post(
  "/revenuecat/webhook",
  verifyRevenueCatWebhook,
  validate(revenueCatWebhookSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { event } = req.body as { event: RevenueCatEvent };
      await processRevenueCatEvent(event);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

const entitlementSelect = {
  planTier: true,
  trialEndsAt: true,
  proUntil: true,
} as const;

type EntitlementRow = {
  planTier: "free" | "pro";
  trialEndsAt: Date | null;
  proUntil: Date | null;
};

/**
 * Everything the client needs to render the paywall and the "N left" hints in
 * one call. Kept off `GET /api/me` so the root-layout profile fetch stays cheap.
 */
async function serializeStatus(userId: string, user: EntitlementRow) {
  return {
    plan_tier: user.planTier,
    is_pro: isPro(user),
    is_trial: isOnTrial(user),
    trial_ends_at: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
    trial_days_left: trialDaysLeft(user),
    pro_until: user.proUntil ? user.proUntil.toISOString() : null,
    purchase_enabled: config.billing.purchaseEnabled,
    features: await getUsage(userId, user),
  };
}

router.get("/status", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: entitlementSelect,
    });
    if (!user) {
      next(new AppError(401, "UNAUTHORIZED", "Account not found. Please sign in again."));
      return;
    }
    res.json(await serializeStatus(req.userId, user));
  } catch (err) {
    next(err);
  }
});

const DAY_MS = 86_400_000;

/** The exact stored state behind each testable plan state. */
function devPlanData(mode: DevPlanMode) {
  switch (mode) {
    case "pro":
      // A paying subscriber: no trial running, so is_trial stays false.
      return { planTier: "pro" as const, proUntil: null, trialEndsAt: null };
    case "trial":
      return {
        planTier: "free" as const,
        proUntil: null,
        trialEndsAt: new Date(Date.now() + config.billing.trialDays * DAY_MS),
      };
    case "trial_expired":
      return { planTier: "free" as const, proUntil: null, trialEndsAt: new Date(Date.now() - DAY_MS) };
    case "free":
      // Never had a trial — a different paywall state from "trial expired".
      return { planTier: "free" as const, proUntil: null, trialEndsAt: null };
  }
}

/**
 * Local testing only: put the account in any plan state without a store, and
 * clear the AI counters so the same flow can be re-run immediately. 404s in
 * production so the endpoint is not part of the deployed surface.
 */
router.post(
  "/dev/simulate",
  requireAuth,
  validate(billingSimulateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (config.nodeEnv === "production") {
        next(new AppError(404, "NOT_FOUND", "Not found"));
        return;
      }
      const { mode } = req.body as { mode: DevPlanMode };
      const [user] = await prisma.$transaction([
        prisma.user.update({
          where: { id: req.userId },
          data: devPlanData(mode),
          select: entitlementSelect,
        }),
        // Quotas are per period, so testing "out of free messages" twice would
        // otherwise need a real week to pass.
        prisma.aiUsage.deleteMany({ where: { userId: req.userId } }),
      ]);
      res.json(await serializeStatus(req.userId, user));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
