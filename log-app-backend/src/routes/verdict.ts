import { Router, Response, NextFunction, Request } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/client";
import {
  computeVerdict,
  type PerExerciseDelta,
  type PreviousVerdict,
} from "../services/verdictEngine";

const router = Router();

function toUtcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfIsoWeek(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return utc;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function topSetByWeek(
  lifts: { date: Date; exerciseName: string; weightKg: unknown }[],
  weekStart: Date,
  weekEnd: Date,
): number | null {
  let max: number | null = null;
  for (const l of lifts) {
    if (l.date < weekStart || l.date >= weekEnd) continue;
    const w = Number(l.weightKg);
    if (max == null || w > max) max = w;
  }
  return max;
}

router.get("/weekly", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const currentWeekStart = startOfIsoWeek(todayUtcMidnight);
    const previousWeekStart = addDays(currentWeekStart, -7);
    const trailing7Start = addDays(todayUtcMidnight, -6);
    const fourWeeksAgoStart = addDays(currentWeekStart, -28);

    const dailyLogs = await prisma.dailyLog.findMany({
      where: {
        userId: req.userId,
        date: { gte: trailing7Start, lte: todayUtcMidnight },
      },
      select: { date: true, weightKg: true, proteinG: true },
      orderBy: { date: "asc" },
    });

    const weightSeriesKg: number[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(trailing7Start, i);
      const log = dailyLogs.find((l) => toUtcDateString(l.date) === toUtcDateString(day));
      if (log?.weightKg != null) {
        weightSeriesKg.push(Number(log.weightKg));
      }
    }

    const liftLogs = await prisma.liftLog.findMany({
      where: {
        userId: req.userId,
        date: { gte: fourWeeksAgoStart, lte: todayUtcMidnight },
      },
      select: { date: true, exerciseName: true, weightKg: true },
    });

    const exerciseNames = Array.from(new Set(liftLogs.map((l) => l.exerciseName)));
    const perExercise: PerExerciseDelta[] = exerciseNames.map((name) => ({
      name,
      thisWeekKg: topSetByWeek(liftLogs, currentWeekStart, addDays(currentWeekStart, 7)),
      lastWeekKg: topSetByWeek(liftLogs, previousWeekStart, currentWeekStart),
    }));

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { proteinTargetG: true },
    });

    let adherencePct: number | null = null;
    if (user?.proteinTargetG != null && user.proteinTargetG > 0) {
      const target = user.proteinTargetG;
      const weekLogs = dailyLogs.filter((l) => l.date >= currentWeekStart);
      let hits = 0;
      for (const l of weekLogs) {
        if (l.proteinG != null && l.proteinG >= target) hits++;
      }
      adherencePct = Math.max(0, Math.min(100, Math.round((hits / 7) * 100)));
    }

    const prevRow = await prisma.weeklyVerdict.findFirst({
      where: {
        userId: req.userId,
        weekStartDate: { lt: currentWeekStart },
      },
      orderBy: { weekStartDate: "desc" },
      select: { strengthTrend: true, weightTrendKgPerWeek: true },
    });

    const previousVerdict: PreviousVerdict | null =
      prevRow && prevRow.strengthTrend && (prevRow.strengthTrend === "up" || prevRow.strengthTrend === "flat" || prevRow.strengthTrend === "down")
        ? {
            strengthTrend: prevRow.strengthTrend,
            weightTrendKgPerWeek: prevRow.weightTrendKgPerWeek == null ? null : Number(prevRow.weightTrendKgPerWeek),
          }
        : null;

    const result = computeVerdict({
      weightSeriesKg,
      perExercise,
      adherencePct,
      previousVerdict,
    });

    const verdictRow = await prisma.weeklyVerdict.upsert({
      where: {
        userId_weekStartDate: {
          userId: req.userId,
          weekStartDate: currentWeekStart,
        },
      },
      create: {
        userId: req.userId,
        weekStartDate: currentWeekStart,
        verdict: result.verdict,
        weightTrendKgPerWeek: result.weightTrendKgPerWeek,
        strengthTrend: result.strengthTrend,
        adherencePct: result.adherencePct,
        reasoning: result.reasoning,
      },
      update: {
        verdict: result.verdict,
        weightTrendKgPerWeek: result.weightTrendKgPerWeek,
        strengthTrend: result.strengthTrend,
        adherencePct: result.adherencePct,
        reasoning: result.reasoning,
      },
    });

    res.json({
      verdict: verdictRow.verdict,
      week_start_date: toUtcDateString(verdictRow.weekStartDate),
      weight_trend_kg_per_week: verdictRow.weightTrendKgPerWeek,
      strength_trend: verdictRow.strengthTrend,
      adherence_pct: verdictRow.adherencePct,
      reasoning: verdictRow.reasoning as unknown as string[],
    });
  } catch (err) {
    next(err);
  }
});

export default router;