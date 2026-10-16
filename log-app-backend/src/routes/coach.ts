import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db/client";
import { clearDecisions, listDecisions, recordDecision } from "../services/coachDecisions";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { rateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import { analyzePhysique, generateCoachPlan, runCoachChatStream } from "../services/coach";
import { coachChatSchema, coachPlanSchema, coachProfileSchema, idParamSchema } from "../validation/schemas";

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

/**
 * Maps an over-size physique photo to 413 (same contract as POST /api/meals/analyze).
 * Without this the raw MulterError reaches the client as an opaque 500.
 */
function receiveImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new AppError(413, "FILE_TOO_LARGE", "Image is too large. Maximum size is 5 MB."));
        return;
      }
      next(new AppError(400, "VALIDATION_ERROR", `Upload rejected: ${err.code}`));
      return;
    }
    next(err);
  });
}

interface ProfileRow {
  goal: string | null;
  weightKg: unknown;
  targetWeightKg: unknown;
  heightCm: number | null;
  sex: string | null;
  age: number | null;
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
    sex: p.sex,
    age: p.age,
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
        sex: d.sex ?? null,
        age: d.age ?? null,
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

router.get("/sessions", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await prisma.coachSession.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        agent: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
    res.json(
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        agent: s.agent,
        updated_at: s.updatedAt.toISOString(),
        message_count: s._count.messages,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.get(
  "/sessions/:id/messages",
  requireAuth,
  validate(idParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await prisma.coachSession.findFirst({
        where: { id: req.params.id as string, userId: req.userId },
        select: { id: true, agent: true },
      });
      if (!session) {
        next(new AppError(404, "NOT_FOUND", "Chat not found"));
        return;
      }
      const messages = await prisma.coachMessage.findMany({
        where: { sessionId: session.id, userId: req.userId },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true, role: true, content: true, proposals: true, createdAt: true },
      });
      res.json({
        agent: session.agent,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          // Unconfirmed proposals ride with their message so a reopened chat can
          // still show the confirm/dismiss card.
          proposals: m.proposals ?? [],
          created_at: m.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/sessions/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await prisma.coachSession.deleteMany({
        where: { id: req.params.id as string, userId: req.userId },
      });
      if (result.count === 0) {
        next(new AppError(404, "NOT_FOUND", "Chat not found"));
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.get("/memory", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memory = await prisma.coachMemory.findUnique({ where: { userId: req.userId } });
    res.json(
      memory ? { summary: memory.summary, updated_at: memory.updatedAt.toISOString() } : null,
    );
  } catch (err) {
    next(err);
  }
});

router.delete("/memory", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.coachMemory.deleteMany({ where: { userId: req.userId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/decisions", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requested = Number((req.query as { limit?: string }).limit ?? 20);
    const limit = Number.isFinite(requested) ? requested : 20;
    res.json(await listDecisions(req.userId, limit));
  } catch (err) {
    next(err);
  }
});

router.delete("/decisions", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await clearDecisions(req.userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/chat/stream",
  requireAuth,
  chatRateLimit,
  validate(coachChatSchema),
  async (req: Request, res: Response) => {
    const { message, sessionId, localDate, agent, dismissedMeal } = req.body as z.infer<
      typeof coachChatSchema
    >;
    const today = localDate ?? new Date().toISOString().slice(0, 10);

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
      await runCoachChatStream(
        req.userId,
        sessionId ?? null,
        message,
        today,
        {
          onSession: (id) => send({ sessionId: id }),
          onDelta: (delta) => send({ delta }),
          onStatus: (status) => send({ status }),
          onProposal: (proposal) => send({ proposal }),
        },
        agent,
        controller.signal,
        dismissedMeal,
      );
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
  receiveImage,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        next(new AppError(400, "VALIDATION_ERROR", "An image file is required"));
        return;
      }
      const description = typeof req.body?.description === "string" ? req.body.description : undefined;
      // The image itself is transient (buffer discarded, never persisted). Only the
      // written read is kept, so the coach can compare check-ins later.
      const { headline, assessment } = await analyzePhysique(
        req.file.buffer,
        req.file.mimetype,
        description,
      );
      const saved = await recordDecision(req.userId, {
        kind: "physique",
        topic: "other",
        summary: headline,
        detail: { assessment },
        reviewInDays: 56,
      });
      res.json({ analysis: assessment, headline, review_on: saved.review_on });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
