import { Router, Response } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  activityLogSchema,
  dailyLogsQuerySchema,
  idParamSchema,
} from "../validation/schemas";
import { assertRangeSize } from "../utils/range";

const router = Router();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function serializeLog(l: {
  id: string;
  date: Date;
  activityType: string;
  name: string;
  durationMin: number;
  distanceKm: number | null;
  caloriesBurned: number | null;
  notes: string | null;
}) {
  return {
    id: l.id,
    date: l.date.toISOString().slice(0, 10),
    activity_type: l.activityType,
    name: l.name,
    duration_min: l.durationMin,
    distance_km: l.distanceKm,
    calories_burned: l.caloriesBurned,
    notes: l.notes,
  };
}

router.get(
  "/activity",
  requireAuth,
  validate(dailyLogsQuerySchema, "query"),
  async (req, res: Response) => {
    const { from, to } = req.query as unknown as { from?: string; to?: string };
    const toDate = to ?? today();
    const fromDate = from ?? toDate;
    assertRangeSize(fromDate, toDate);

    const logs = await prisma.activityLog.findMany({
      where: {
        userId: req.userId,
        date: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 5000,
    });

    res.json(logs.map(serializeLog));
  },
);

router.post(
  "/activity",
  requireAuth,
  validate(activityLogSchema),
  async (req, res: Response) => {
    const {
      date,
      activity_type,
      name,
      duration_min,
      distance_km,
      calories_burned,
      notes,
    } = req.body;

    const log = await prisma.activityLog.create({
      data: {
        userId: req.userId,
        date: new Date(date),
        activityType: activity_type,
        name,
        durationMin: duration_min,
        distanceKm: distance_km ?? null,
        caloriesBurned: calories_burned ?? null,
        notes: notes ?? null,
      },
    });

    res.status(201).json(serializeLog(log));
  },
);

router.delete(
  "/activity/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  async (req, res: Response) => {
    const { id } = req.params as unknown as { id: string };

    const result = await prisma.activityLog.deleteMany({
      where: { id, userId: req.userId },
    });

    if (result.count === 0) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Activity log not found" } });
      return;
    }

    res.json({ ok: true });
  },
);

export default router;
