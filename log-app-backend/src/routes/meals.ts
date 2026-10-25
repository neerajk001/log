import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { config } from "../config";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { rateLimit } from "../middleware/rateLimit";
import { requireFeature, requirePro } from "../middleware/entitlements";
import { validate } from "../middleware/validate";
import {
  createMealSchema,
  idParamSchema,
  mealDateQuerySchema,
  updateMealSchema,
} from "../validation/schemas";
import {
  createMealIdempotent,
  deleteMeal,
  listMeals,
  serializeMeal,
  updateMeal,
} from "../services/meals";
import { analyzeMeal, analyzeEatingOut } from "../services/coach";
import { getMealSuggestions } from "../services/mealSuggestions";

const router = Router();

const analyzeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  // 10/hr per user, matching api.md and security.md — a photo analysis is a
  // billable vision call and has no legitimate high-frequency use.
  max: 10,
  keyGenerator: (req) => req.userId,
});

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 8,
    parts: 10,
    fieldSize: 64 * 1024,
  },
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

/**
 * Pro-only eat-now suggestions: meals the athlete has logged before that fit
 * what is left of today's calorie budget. Deterministic and DB-only — no model
 * call and no quota row; the entitlement check is the only gate.
 */
router.get(
  "/suggestions",
  requireAuth,
  validate(mealDateQuerySchema, "query"),
  requirePro("Eat-now suggestions are part of Pro."),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date } = req.query as unknown as { date: string };
      res.json(await getMealSuggestions(req.userId, date));
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
      const { meal, created } = await createMealIdempotent(req.userId, req.body);
      res.status(created ? 201 : 200).json(serializeMeal(meal));
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

/**
 * Multer aborts a too-large body mid-upload; without this the raw MulterError reaches
 * the client as an opaque failure (and can drop the connection while the phone is
 * still sending), which reads as "can't reach the server".
 */
function receiveImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(
          new AppError(
            413,
            "FILE_TOO_LARGE",
            `Image is too large. Maximum size is ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`,
          ),
        );
        return;
      }
      next(new AppError(400, "VALIDATION_ERROR", `Upload rejected: ${err.code}`));
      return;
    }
    next(err);
  });
}

/**
 * Eating-out helper: a menu photo and/or a description, metered under its own
 * allowance (2/month Free, unlimited on Pro/trial). The photo is transient.
 */
router.post(
  "/eating-out",
  requireAuth,
  analyzeRateLimit,
  requireFeature("eating_out"),
  receiveImage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const description =
        typeof req.body?.description === "string" ? req.body.description : undefined;
      if (!req.file && !description?.trim()) {
        next(
          new AppError(
            400,
            "VALIDATION_ERROR",
            "Add a menu photo or describe the restaurant and what you fancy.",
          ),
        );
        return;
      }
      const localDate = typeof req.body?.date === "string" ? req.body.date : undefined;
      const result = await analyzeEatingOut(
        req.userId,
        req.file?.buffer,
        req.file?.mimetype,
        description,
        localDate,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/analyze",
  requireAuth,
  analyzeRateLimit,
  // Metered before the upload is read: a quota-rejected photo is never buffered.
  requireFeature("meal_scan"),
  receiveImage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        next(new AppError(400, "VALIDATION_ERROR", "An image file is required"));
        return;
      }
      if (config.nodeEnv !== "production") {
        // What actually arrived — the photo path fails on the client, so this is the
        // other half of the picture.
        console.log("[meal-analyze]", {
          user: req.userId,
          bytes: req.file.size,
          mime: req.file.mimetype,
          date: typeof req.body?.date === "string" ? req.body.date : null,
          hasNote: typeof req.body?.description === "string",
        });
      }
      const description =
        typeof req.body?.description === "string" ? req.body.description : undefined;
      const localDate = typeof req.body?.date === "string" ? req.body.date : undefined;
      const result = await analyzeMeal(
        req.userId,
        req.file.buffer,
        req.file.mimetype,
        description,
        localDate,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
