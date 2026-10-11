import { Router, Response, NextFunction, Request } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { trendsQuerySchema } from "../validation/schemas";
import { computeTrends, type TrendRange } from "../services/trends";

const router = Router();

router.get("/", requireAuth, validate(trendsQuerySchema, "query"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { range, weeks } = req.query as unknown as { range?: TrendRange; weeks?: number };
    const result = await computeTrends(req.userId, range, { nutritionWeeks: weeks });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;