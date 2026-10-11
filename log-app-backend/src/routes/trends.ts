import { Router, Response, NextFunction, Request } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { trendsQuerySchema } from "../validation/schemas";
import { computeTrends, type TrendRange } from "../services/trends";

const router = Router();

router.get("/", requireAuth, validate(trendsQuerySchema, "query"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { range, weeks, date } = req.query as unknown as {
      range?: TrendRange;
      weeks?: number;
      date?: string;
    };
    const result = await computeTrends(req.userId, range, {
      nutritionWeeks: weeks,
      // The athlete's local date anchors every bucket; the server's UTC "today" can
      // be a day behind theirs (IST) and would exclude today's rows entirely.
      ...(date ? { now: new Date(`${date}T00:00:00Z`) } : {}),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;