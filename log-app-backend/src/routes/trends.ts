import { Router, Response, NextFunction, Request } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { trendsQuerySchema } from "../validation/schemas";
import { computeTrends } from "../services/trends";

const router = Router();

router.get("/", requireAuth, validate(trendsQuerySchema, "query"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await computeTrends(req.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;