import { Router, Response, NextFunction, Request } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { planTodayQuerySchema } from "../validation/schemas";
import { prisma } from "../db/client";
import { recordDecision } from "../services/coachDecisions";
import {
  buildPerExerciseDeltas,
  computeVerdict,
  verdictIsUnchanged,
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

router.get("/weekly", requireAuth, validate(planTodayQuerySchema, "query"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // The athlete's local date: the server runs on UTC, and near midnight their
    // "today" (and week) can differ from UTC's. Same optional-`date` contract as
    // GET /api/plans/:id/today and /api/trends — omitted means server UTC, as before.
    const { date } = req.query as unknown as { date?: string };
    const now = date ? new Date(`${date}T00:00:00Z`) : new Date();
    const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const currentWeekStart = startOfIsoWeek(todayUtcMidnight);
    const previousWeekStart = addDays(currentWeekStart, -7);
    const trailing7Start = addDays(todayUtcMidnight, -6);
    const fourWeeksAgoStart = addDays(currentWeekStart, -28);

    // One round of independent reads instead of four sequential awaits.
    const [dailyLogs, liftLogs, user, prevRow, currentRow] = await Promise.all([
      prisma.dailyLog.findMany({
        where: {
          userId: req.userId,
          // Four weeks, so a once-a-week weigher can still be read a trend from.
          date: { gte: addDays(currentWeekStart, -28), lte: todayUtcMidnight },
        },
        select: { date: true, weightKg: true, proteinG: true, calories: true },
        orderBy: { date: "asc" },
      }),
      prisma.liftLog.findMany({
        where: {
          userId: req.userId,
          date: { gte: fourWeeksAgoStart, lte: todayUtcMidnight },
        },
        select: { date: true, exerciseName: true, weightKg: true },
      }),
      prisma.user.findUnique({
        where: { id: req.userId },
        select: { proteinTargetG: true, calorieTarget: true, trackWeight: true },
      }),
      prisma.weeklyVerdict.findFirst({
        where: {
          userId: req.userId,
          weekStartDate: { lt: currentWeekStart },
        },
        orderBy: { weekStartDate: "desc" },
        select: { verdict: true, strengthTrend: true, weightTrendKgPerWeek: true },
      }),
      // This week's row, so a recomputation that changes nothing stays a read.
      prisma.weeklyVerdict.findUnique({
        where: {
          userId_weekStartDate: { userId: req.userId, weekStartDate: currentWeekStart },
        },
        select: {
          weekStartDate: true,
          verdict: true,
          weightTrendKgPerWeek: true,
          strengthTrend: true,
          adherencePct: true,
          reasoning: true,
        },
      }),
    ]);

    const collectWeights = (start: Date, days: number): { day: number; kg: number }[] => {
      const points: { day: number; kg: number }[] = [];
      for (let i = 0; i < days; i++) {
        const day = addDays(start, i);
        const log = dailyLogs.find((l) => toUtcDateString(l.date) === toUtcDateString(day));
        if (log?.weightKg != null) points.push({ day: i, kg: Number(log.weightKg) });
      }
      return points;
    };

    // Daily weighers keep the responsive 7-day read; if that's too thin (weekly
    // weigh-ins), fall back to the last 28 days *ending today*. The engine uses the
    // real day offsets, so two weigh-ins a week apart still give kg/week.
    const weeklyPoints = collectWeights(trailing7Start, 7);
    const trackedWeight =
      user?.trackWeight === false
        ? []
        : weeklyPoints.length >= 4
          ? weeklyPoints
          : collectWeights(addDays(todayUtcMidnight, -27), 28);

    const perExercise = buildPerExerciseDeltas(
      liftLogs,
      currentWeekStart,
      previousWeekStart,
    );

    const elapsedDays = Math.max(
      1,
      Math.min(7, Math.floor((now.getTime() - currentWeekStart.getTime()) / 86400000) + 1),
    );
    /** Days elapsed this week that met the target, as a percentage. */
    const adherenceFor = (
      target: number | null | undefined,
      pick: (log: { proteinG: number | null; calories: number | null }) => number | null,
    ): number | null => {
      if (target == null || target <= 0) return null;
      const weekLogs = dailyLogs.filter((l) => l.date >= currentWeekStart);
      let hits = 0;
      for (const l of weekLogs) {
        const value = pick(l);
        if (value != null && value >= target) hits++;
      }
      return Math.max(0, Math.min(100, Math.round((hits / elapsedDays) * 100)));
    };

    const adherencePct = adherenceFor(user?.proteinTargetG, (l) => l.proteinG);
    const calorieAdherencePct = adherenceFor(user?.calorieTarget, (l) => l.calories);

    const previousVerdict: PreviousVerdict | null =
      prevRow && prevRow.strengthTrend && (prevRow.strengthTrend === "up" || prevRow.strengthTrend === "flat" || prevRow.strengthTrend === "down")
        ? {
            strengthTrend: prevRow.strengthTrend,
            weightTrendKgPerWeek: prevRow.weightTrendKgPerWeek == null ? null : Number(prevRow.weightTrendKgPerWeek),
          }
        : null;

    const result = computeVerdict({
      weightSeriesKg: trackedWeight,
      perExercise,
      adherencePct,
      previousVerdict,
      // No weigh-ins: the verdict still runs, on strength and adherence.
      allowNoWeight: user?.trackWeight === false,
    });

    // "This week" context: how much was actually logged, from the rows already fetched.
    const weekDailyLogs = dailyLogs.filter((l) => l.date >= currentWeekStart);
    const weekLiftLogs = liftLogs.filter((l) => l.date >= currentWeekStart);
    const mean = (values: number[]): number | null =>
      values.length === 0
        ? null
        : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const week = {
      workouts: new Set(weekLiftLogs.map((l) => toUtcDateString(l.date))).size,
      sets: weekLiftLogs.length,
      days_logged: weekDailyLogs.length,
      avg_calories: mean(
        weekDailyLogs.map((l) => l.calories).filter((c): c is number => c != null),
      ),
      avg_protein_g: mean(
        weekDailyLogs.map((l) => l.proteinG).filter((p): p is number => p != null),
      ),
    };

    // This is a GET: recomputing is the point, but writing is only needed when the
    // week's picture actually moved (a new weigh-in, session or target change).
    const verdictRow =
      currentRow && verdictIsUnchanged(currentRow, result)
        ? currentRow
        : await prisma.weeklyVerdict.upsert({
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

    // One ledger entry per week, so the coach can follow its own advice up later.
    try {
      const alreadyLogged = await prisma.coachDecision.findFirst({
        where: {
          userId: req.userId,
          kind: "verdict",
          createdAt: { gte: currentWeekStart },
        },
        select: { id: true },
      });
      if (!alreadyLogged) {
        const labels: Record<string, string> = {
          hold: "hold",
          adjust_calories: "adjust calories",
          check_recovery: "check recovery",
        };
        await recordDecision(
          req.userId,
          {
            kind: "verdict",
            summary: `Verdict: ${labels[result.verdict] ?? result.verdict} — ${
              result.reasoning[0] ?? "weekly call"
            }`,
            detail: {
              verdict: result.verdict,
              weight_trend_kg_per_week: result.weightTrendKgPerWeek,
              strength_trend: result.strengthTrend,
              adherence_pct: result.adherencePct,
            },
            topic: "diet",
            reviewInDays: 7,
          },
          toUtcDateString(todayUtcMidnight),
        );
      }
    } catch {
      // Best-effort: never fail the verdict because the ledger couldn't be written.
      // Warn (don't swallow silently) so repeated ledger failures are diagnosable.
      // No user id: prod logs carry no user identifiers (Phase 0 privacy contract).
      console.warn("[verdict] coach ledger write failed");
    }

    res.json({
      verdict: verdictRow.verdict,
      week_start_date: toUtcDateString(verdictRow.weekStartDate),
      weight_trend_kg_per_week:
        verdictRow.weightTrendKgPerWeek == null
          ? null
          : Number(verdictRow.weightTrendKgPerWeek),
      strength_trend: verdictRow.strengthTrend,
      adherence_pct: verdictRow.adherencePct,
      calorie_adherence_pct: calorieAdherencePct,
      previous_verdict: prevRow?.verdict ?? null,
      week,
      reasoning: verdictRow.reasoning as unknown as string[],
    });
  } catch (err) {
    next(err);
  }
});

export default router;