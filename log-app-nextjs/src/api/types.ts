export interface UserProfile {
  id: string;
  protein_target_g: number | null;
  calorie_target: number | null;
  created_at: string;
}

export interface DailyLog {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number | null;
  calories: number | null;
  protein_g: number | null;
  sleep_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface LiftLog {
  id: string;
  user_id: string;
  date: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  plan_day_id: string | null;
  created_at: string;
}

export type DailyField = 'weight_kg' | 'calories' | 'protein_g' | 'sleep_hours';

export type ApiErrorInfo = { code: string; message: string };

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

export interface Plan {
  id: string;
  name: string;
  source: string;
  is_active: boolean;
  created_at: string;
  days: PlanDay[];
}

export interface PlanTodayExercise {
  name: string;
  sets: number;
  reps: string;
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

export type VerdictValue = 'hold' | 'adjust_calories' | 'check_recovery';
export interface VerdictResult {
  verdict: VerdictValue;
  week_start_date: string;
  weight_trend_kg_per_week: number;
  strength_trend: string;
  adherence_pct: number;
  reasoning: string[];
}
