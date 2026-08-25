import { prisma } from '@/lib/db/client';
import { evaluateVerdict, type StrengthTrend, type VerdictInput } from '@/lib/services/verdictEngine';

export interface TrendWeightPoint {
  week_start: string;
  avg_kg: number;
}
export interface TrendLiftRow {
  exercise: string;
  this_week_kg: number;
  last_week_kg: number | null;
  delta: 'up' | 'flat' | 'down';
}
export interface TrendsResult {
  weight: TrendWeightPoint[];
  lifts: TrendLiftRow[];
  adherence_pct: number;
}

function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = (day + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
}
function key(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}
function topSet(weights: number[]): number {
  return weights.length ? Math.max(...weights) : 0;
}
function slope(points: number[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const xs = points.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = points.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (points[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export async function computeTrends(userId: string): Promise<TrendsResult> {
  const today = new Date();
  const ws = weekStart(today);
  const from = new Date(ws);
  from.setUTCDate(from.getUTCDate() - 21); // 3 prior weeks + current

  const [dailyLogs, liftLogs, user] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: from, lte: today } },
      orderBy: { date: 'asc' },
    }),
    prisma.liftLog.findMany({
      where: { userId, date: { gte: new Date(ws.getTime() - 7 * 86400000), lte: today } },
      orderBy: { date: 'asc' },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { proteinTargetG: true } }),
  ]);

  // Weekly weight averages (oldest -> newest)
  const weight: TrendWeightPoint[] = [];
  for (let w = 3; w >= 0; w--) {
    const wk = new Date(ws.getTime() - w * 7 * 86400000);
    const vals = dailyLogs
      .filter((d) => {
        const ds = weekStart(new Date(d.date.getTime()));
        return ds.getTime() === wk.getTime() && d.weightKg != null;
      })
      .map((d) => num(d.weightKg));
    if (vals.length) {
      weight.push({ week_start: key(wk), avg_kg: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) });
    }
  }

  // Lift deltas: this week vs last week
  const cur: Record<string, number[]> = {};
  const prev: Record<string, number[]> = {};
  const lastWeekStart = new Date(ws.getTime() - 7 * 86400000);
  for (const l of liftLogs) {
    const ld = new Date(l.date.getTime());
    const name = l.exerciseName;
    const w = num(l.weightKg);
    if (ld >= ws) (cur[name] ??= []).push(w);
    else if (ld >= lastWeekStart) (prev[name] ??= []).push(w);
  }
  const lifts: TrendLiftRow[] = Object.keys(cur).map((ex) => {
    const thisWeek = topSet(cur[ex]);
    const lastWeek = ex in prev ? topSet(prev[ex]) : null;
    let delta: 'up' | 'flat' | 'down' = 'flat';
    if (lastWeek == null) delta = 'flat';
    else if (thisWeek > lastWeek) delta = 'up';
    else if (thisWeek < lastWeek) delta = 'down';
    return { exercise: ex, this_week_kg: thisWeek, last_week_kg: lastWeek, delta };
  });

  // Adherence: protein target met this week
  const target = user?.proteinTargetG ?? null;
  const thisWeekDaily = dailyLogs.filter((d) => new Date(d.date.getTime()) >= ws);
  const met = target ? thisWeekDaily.filter((d) => d.proteinG != null && d.proteinG >= target).length : 0;
  const adherence_pct = Math.round((met / 7) * 100);

  return { weight, lifts, adherence_pct };
}

async function computeVerdictInput(userId: string): Promise<VerdictInput> {
  const today = new Date();
  const ws = weekStart(today);
  const from = new Date(ws);
  from.setUTCDate(from.getUTCDate() - 28); // 4 weeks of history

  const [dailyLogs, liftLogs, user] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: from, lte: today } },
      orderBy: { date: 'asc' },
    }),
    prisma.liftLog.findMany({
      where: { userId, date: { gte: from, lte: today } },
      orderBy: { date: 'asc' },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { proteinTargetG: true } }),
  ]);

  // Weekly weight averages oldest -> newest
  const weekly: number[] = [];
  for (let w = 3; w >= 0; w--) {
    const wk = new Date(ws.getTime() - w * 7 * 86400000);
    const vals = dailyLogs
      .filter((d) => {
        const ds = weekStart(new Date(d.date.getTime()));
        return ds.getTime() === wk.getTime() && d.weightKg != null;
      })
      .map((d) => num(d.weightKg));
    weekly.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN);
  }
  const valid = weekly.filter((v) => !Number.isNaN(v));
  const weightTrendKgPerWeek = Number(slope(valid).toFixed(2));

  // Stalled weeks: trailing consecutive week-over-week deltas > -0.2
  let stalledWeeks = 0;
  const real = weekly.map((v) => (Number.isNaN(v) ? null : v));
  for (let i = real.length - 1; i > 0; i--) {
    const a = real[i];
    const b = real[i - 1];
    if (a == null || b == null) break;
    if (a - b > -0.2) stalledWeeks++;
    else break;
  }

  // Strength direction per week (oldest -> newest) using top-set weights
  const weekExTop = (wkStart: Date): Record<string, number> => {
    const next = new Date(wkStart.getTime() + 7 * 86400000);
    const map: Record<string, number[]> = {};
    for (const l of liftLogs) {
      const ld = new Date(l.date.getTime());
      if (ld >= wkStart && ld < next) (map[l.exerciseName] ??= []).push(num(l.weightKg));
    }
    const out: Record<string, number> = {};
    for (const k of Object.keys(map)) out[k] = topSet(map[k]);
    return out;
  };
  const dirForWeek = (wkStart: Date): StrengthTrend => {
    const curW = weekExTop(wkStart);
    const prevW = weekExTop(new Date(wkStart.getTime() - 7 * 86400000));
    const common = Object.keys(curW).filter((k) => k in prevW);
    if (!common.length) return 'flat';
    const diff = common.reduce((s, k) => s + (curW[k] - prevW[k]), 0);
    if (diff > 0) return 'up';
    if (diff < 0) return 'down';
    return 'flat';
  };

  const dirs: StrengthTrend[] = [3, 2, 1, 0].map((w) => dirForWeek(new Date(ws.getTime() - w * 7 * 86400000)));
  const strengthTrend = dirs[dirs.length - 1];
  let strengthDownWeeks = 0;
  for (let i = dirs.length - 1; i >= 0; i--) {
    if (dirs[i] === 'down') strengthDownWeeks++;
    else break;
  }

  // Adherence
  const target = user?.proteinTargetG ?? null;
  const thisWeekDaily = dailyLogs.filter((d) => new Date(d.date.getTime()) >= ws);
  const met = target ? thisWeekDaily.filter((d) => d.proteinG != null && d.proteinG >= target).length : 0;
  const adherencePct = Math.round((met / 7) * 100);

  return { weightTrendKgPerWeek, strengthTrend, strengthDownWeeks, stalledWeeks, adherencePct };
}

export async function computeAndStoreVerdict(userId: string) {
  const input = await computeVerdictInput(userId);
  const result = evaluateVerdict(input);
  const weekStartKey = key(weekStart(new Date()));

  await prisma.weeklyVerdict.upsert({
    where: { userId_weekStartDate: { userId, weekStartDate: new Date(`${weekStartKey}T00:00:00.000Z`) } },
    update: {
      verdict: result.verdict,
      weightTrendKgPerWeek: result.weightTrendKgPerWeek,
      strengthTrend: result.strengthTrend,
      adherencePct: result.adherencePct,
      reasoning: result.reasoning,
    },
    create: {
      userId,
      weekStartDate: new Date(`${weekStartKey}T00:00:00.000Z`),
      verdict: result.verdict,
      weightTrendKgPerWeek: result.weightTrendKgPerWeek,
      strengthTrend: result.strengthTrend,
      adherencePct: result.adherencePct,
      reasoning: result.reasoning,
    },
  });

  return {
    verdict: result.verdict,
    week_start_date: weekStartKey,
    weight_trend_kg_per_week: result.weightTrendKgPerWeek,
    strength_trend: result.strengthTrend,
    adherence_pct: result.adherencePct,
    reasoning: result.reasoning,
  };
}
