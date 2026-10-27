import { NextFunction, Request, Response, Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePro } from "../middleware/entitlements";
import { validate } from "../middleware/validate";
import { bodyAnalysisQuerySchema } from "../validation/schemas";
import { getBodyAnalysis, type BodyAnalysisRange } from "../services/bodyAnalysis";

const router = Router();

/**
 * Pro detailed weight/nutrition analysis. Deterministic and DB-only, so it has
 * no AI quota; the entitlement gate is the only access control. Free accounts
 * keep their existing 7-day Insights overview.
 */
router.get(
  "/body",
  requireAuth,
  requirePro("Detailed weight and nutrition analysis is part of Pro."),
  validate(bodyAnalysisQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { range, date } = req.query as unknown as {
        range?: BodyAnalysisRange;
        date?: string;
      };
      res.json(await getBodyAnalysis(req.userId, range ?? "30d", date));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
