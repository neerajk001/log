import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { rateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import { analyzePhysique, generateCoachPlan, runCoachChat, runCoachChatStream } from "../services/coach";
import { coachChatSchema, coachPlanSchema, coachProfileSchema } from "../validation/schemas";

const router = Router();

// Each of these endpoints costs real money per call — meter them per user.
const chatRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, keyGenerator: (req) => req.userId });
const planRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyGenerator: (req) => req.userId });
const analyzeRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyGenerator: (req) => req.userId });

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

interface ProfileRow {
  goal: string | null;
  weightKg: unknown;
  targetWeightKg: unknown;
  heightCm: number | null;
  experience: string | null;
  daysPerWeek: number | null;
  equipment: string | null;
  dietNotes: string | null;
  injuries: string | null;
  notes: string | null;
}

function serializeProfile(p: ProfileRow) {
  return {
    goal: p.goal,
    weight_kg: p.weightKg == null ? null : Number(p.weightKg),
    target_weight_kg: p.targetWeightKg == null ? null : Number(p.targetWeightKg),
    height_cm: p.heightCm,
    experience: p.experience,
    days_per_week: p.daysPerWeek,
    equipment: p.equipment,
    diet_notes: p.dietNotes,
    injuries: p.injuries,
    notes: p.notes,
  };
}

router.get("/profile", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.coachProfile.findUnique({ where: { userId: req.userId } });
    res.json(profile ? serializeProfile(profile) : null);
  } catch (err) {
    next(err);
  }
});

router.put(
  "/profile",
  requireAuth,
  validate(coachProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const d = req.body as z.infer<typeof coachProfileSchema>;
      const data = {
        goal: d.goal ?? null,
        weightKg: d.weight_kg ?? null,
        targetWeightKg: d.target_weight_kg ?? null,
        heightCm: d.height_cm ?? null,
        experience: d.experience ?? null,
        daysPerWeek: d.days_per_week ?? null,
        equipment: d.equipment ?? null,
        dietNotes: d.diet_notes ?? null,
        injuries: d.injuries ?? null,
        notes: d.notes ?? null,
      };
      const profile = await prisma.coachProfile.upsert({
        where: { userId: req.userId },
        create: { userId: req.userId, ...data },
        update: data,
      });
      res.json(serializeProfile(profile));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/messages", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messages = await prisma.coachMessage.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, role: true, content: true, createdAt: true },
    });
    res.json(
      messages.reverse().map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.post(
  "/chat",
  requireAuth,
  chatRateLimit,
  validate(coachChatSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message } = req.body as z.infer<typeof coachChatSchema>;
      const reply = await runCoachChat(req.userId, message);
      res.json({ reply });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/chat/stream",
  requireAuth,
  chatRateLimit,
  validate(coachChatSchema),
  async (req: Request, res: Response) => {
    const { message } = req.body as z.infer<typeof coachChatSchema>;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let closed = false;
    const send = (payload: unknown) => {
      if (!closed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // A client Stop (or a dropped connection) aborts the upstream model call.
    const controller = new AbortController();
    req.on("close", () => {
      closed = true;
      controller.abort();
    });

    try {
      await runCoachChatStream(req.userId, message, (delta) => send({ delta }), controller.signal);
      send({ done: true });
    } catch (err) {
      // Headers are already sent, so we can't hand this to the error middleware.
      send({ error: err instanceof Error ? err.message : "The coach failed to reply" });
    } finally {
      if (!closed) res.end();
    }
  },
);

router.post(
  "/plan",
  requireAuth,
  planRateLimit,
  validate(coachPlanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { goal, notes } = req.body as z.infer<typeof coachPlanSchema>;
      const plan = await generateCoachPlan(req.userId, goal, notes);
      res.json(plan);
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
      const description = typeof req.body?.description === "string" ? req.body.description : undefined;
      // Transient: the buffer is discarded after this call, never persisted.
      const analysis = await analyzePhysique(req.file.buffer, req.file.mimetype, description);
      res.json({ analysis });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
