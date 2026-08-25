export interface DailyLog {
  date: string;
  weight_kg: number | null;
  calories: number | null;
  protein_g: number | null;
  sleep_hours: number | null;
}

export interface DailyLogUpsert {
  weight_kg?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  sleep_hours?: number | null;
}

export interface LiftLog {
  id: string;
  date: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  plan_day_id: string | null;
}

export interface LiftLogCreate {
  date: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  plan_day_id?: string | null;
}

export interface UserProfile {
  id: string;
  protein_target_g: number | null;
  calorie_target: number | null;
}

export interface PlanExercise {
  name: string;
  sets: number;
  reps: string;
}

export interface PlanDay {
  id: string;
  day_name: string;
  day_order: number;
  exercises: PlanExercise[];
}

export interface WorkoutPlan {
  id: string;
  name: string;
  source: "manual" | "ai_parsed";
  is_active: boolean;
  created_at: string;
  days: PlanDay[];
}

export interface ParsedPlanPreview {
  days: { day_name: string; exercises: PlanExercise[] }[];
}

export interface PlanTodayExercise extends PlanExercise {
  logged: boolean;
  last_log: { weight_kg: number; reps: number } | null;
}

export interface PlanToday {
  plan_id: string;
  plan_name: string;
  day: {
    id: string;
    day_name: string;
    day_order: number;
    exercises: PlanTodayExercise[];
  } | null;
}

export interface CreatePlanInput {
  name: string;
  source: "manual" | "ai_parsed";
  days: { day_name: string; exercises: PlanExercise[] }[];
}

export type VerdictKind = "hold" | "adjust_calories" | "check_recovery";
export type StrengthTrend = "up" | "flat" | "down";

export interface VerdictResponse {
  verdict: VerdictKind;
  week_start_date: string;
  weight_trend_kg_per_week: number | null;
  strength_trend: StrengthTrend | null;
  adherence_pct: number | null;
  reasoning: string[];
}

export interface WeightPoint {
  week_start: string;
  avg_kg: number | null;
}

export interface LiftDelta {
  exercise: string;
  this_week_kg: number | null;
  last_week_kg: number | null;
  delta: "up" | "flat" | "down";
}

export interface TrendsResponse {
  weight: WeightPoint[];
  lifts: LiftDelta[];
  adherence_pct: number | null;
}
