import { Router, Response, NextFunction, Request } from "express";
import { config } from "../config";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { trendsQuerySchema } from "../validation/schemas";
import { computeTrends, type TrendRange } from "../services/trends";
import { isPro } from "../services/entitlements";

const router = Router();

const FREE_RANGE: TrendRange = "7d";

router.get("/", requireAuth, validate(trendsQuerySchema, "query"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { range, weeks, date } = req.query as unknown as {
      range?: TrendRange;
      weeks?: number;
      date?: string;
    };

    // Wide ranges are a Pro feature. Clamped server-side (not just hidden in the
    // UI) so the numbers a Free athlete sees are always what they asked for.
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { planTier: true, trialEndsAt: true, proUntil: true },
    });
    const pro = user ? isPro(user) : false;
    const requested = range ?? "30d";
    const effective = pro ? requested : FREE_RANGE;

    const result = await computeTrends(req.userId, effective, {
      nutritionWeeks: weeks,
      // The athlete's local date anchors every bucket; the server's UTC "today" can
      // be a day behind theirs (IST) and would exclude today's rows entirely.
      ...(date ? { now: new Date(`${date}T00:00:00Z`) } : {}),
    });

    res.json({
      ...result,
      range: effective,
      limited: !pro && requested !== FREE_RANGE,
      max_days: pro ? null : config.billing.freeAnalyticsDays,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
