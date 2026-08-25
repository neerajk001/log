import type { DailyLog, LiftLog, User, ActivityLog } from '@prisma/client';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export function serializeUser(u: User) {
  return {
    id: u.id,
    protein_target_g: u.proteinTargetG,
    calorie_target: u.calorieTarget,
    daily_defaults: (u.dailyDefaults as Record<string, number> | null) ?? null,
    created_at: u.createdAt.toISOString(),
  };
}

export function serializeDailyLog(l: DailyLog) {
  return {
    id: l.id,
    user_id: l.userId,
    date: toDateStr(l.date),
    weight_kg: num(l.weightKg),
    calories: l.calories,
    protein_g: l.proteinG,
    sleep_hours: num(l.sleepHours),
    created_at: l.createdAt.toISOString(),
    updated_at: l.updatedAt.toISOString(),
  };
}

export function serializeLiftLog(l: LiftLog) {
  return {
    id: l.id,
    user_id: l.userId,
    date: toDateStr(l.date),
    exercise_name: l.exerciseName,
    weight_kg: num(l.weightKg),
    reps: l.reps,
    plan_day_id: l.planDayId,
    created_at: l.createdAt.toISOString(),
  };
}

export function serializeActivityLog(a: ActivityLog) {
  return {
    id: a.id,
    user_id: a.userId,
    date: toDateStr(a.date),
    activity_type: a.activityType,
    name: a.name,
    duration_min: a.durationMin,
    distance_km: a.distanceKm != null ? Number(a.distanceKm) : null,
    calories_burned: a.caloriesBurned,
    notes: a.notes,
    created_at: a.createdAt.toISOString(),
  };
}

type PlanDayExercise = { name: string; sets: number; reps: string };

export function serializePlan(plan: {
  id: string;
  name: string;
  source: string;
  isActive: boolean;
  createdAt: Date;
  planDays: { id: string; dayName: string; dayOrder: number; exercises: unknown }[];
}) {
  return {
    id: plan.id,
    name: plan.name,
    source: plan.source,
    is_active: plan.isActive,
    created_at: plan.createdAt.toISOString(),
    days: plan.planDays
      .slice()
      .sort((a, b) => a.dayOrder - b.dayOrder)
      .map((d) => ({
        id: d.id,
        day_name: d.dayName,
        day_order: d.dayOrder,
        exercises: (d.exercises as unknown as PlanDayExercise[]) ?? [],
      })),
  };
}
