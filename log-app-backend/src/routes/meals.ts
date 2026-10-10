import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { rateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import {
  createMealSchema,
  idParamSchema,
  mealDateQuerySchema,
  updateMealSchema,
} from "../validation/schemas";
import {
  createMeal,
  deleteMeal,
  listMeals,
  serializeMeal,
  updateMeal,
} from "../services/meals";
import { analyzeMeal } from "../services/coach";

const router = Router();

const analyzeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.userId,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, "VALIDATION_ERROR", "Only JPEG, PNG or WebP images are accepted"));
    }
  },
});

router.get(
  "/",
  requireAuth,
  validate(mealDateQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date } = req.query as unknown as { date: string };
      const meals = await listMeals(req.userId, date);
      const totals = meals.reduce(
        (acc, m) => ({ calories: acc.calories + m.calories, protein_g: acc.protein_g + m.proteinG }),
        { calories: 0, protein_g: 0 },
      );
      res.json({ date, meals: meals.map(serializeMeal), totals });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/",
  requireAuth,
  validate(createMealSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meal = await createMeal(req.userId, req.body);
      res.status(201).json(serializeMeal(meal));
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(updateMealSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meal = await updateMeal(req.userId, req.params.id as string, req.body);
      if (!meal) {
        next(new AppError(404, "NOT_FOUND", "Meal not found"));
        return;
      }
      res.json(serializeMeal(meal));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ok = await deleteMeal(req.userId, req.params.id as string);
      if (!ok) {
        next(new AppError(404, "NOT_FOUND", "Meal not found"));
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/analyze",
  requireAuth,
  analyzeRateLimit,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        next(new AppError(400, "VALIDATION_ERROR", "An image file is required"));
        return;
      }
      const description =
        typeof req.body?.description === "string" ? req.body.description : undefined;
      const result = await analyzeMeal(req.file.buffer, req.file.mimetype, description);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
