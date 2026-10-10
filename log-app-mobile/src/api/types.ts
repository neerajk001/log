export interface DailyLog {
  id?: string;
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

export interface DailyDefaults {
  weight_kg?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  sleep_hours?: number | null;
}

export type DailyField = "weight_kg" | "calories" | "protein_g" | "sleep_hours";

export interface LiftLog {
  id: string;
  date: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  plan_day_id: string | null;
}

export interface LiftLogCreate {
  id?: string;
  date: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  plan_day_id?: string | null;
}

export type ActivityType = "run" | "cycle" | "walk" | "swim" | "other";

export interface ActivityLog {
  id: string;
  date: string;
  activity_type: ActivityType;
  name: string;
  duration_min: number;
  distance_km: number | null;
  calories_burned: number | null;
  notes: string | null;
}

export interface ActivityLogCreate {
  date: string;
  activity_type: ActivityType;
  name: string;
  duration_min: number;
  distance_km?: number | null;
  calories_burned?: number | null;
  notes?: string | null;
}

export interface UserProfile {
  id: string;
  protein_target_g: number | null;
  calorie_target: number | null;
  daily_defaults?: DailyDefaults | null;
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

export interface PlanDayToday {
  id: string;
  day_name: string;
  day_order: number;
  exercises: PlanTodayExercise[];
}

export interface PlanToday {
  plan_id: string;
  plan_name: string;
  day: PlanDayToday | null;
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

export interface CoachProfile {
  goal: string | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  height_cm: number | null;
  experience: string | null;
  days_per_week: number | null;
  equipment: string | null;
  diet_notes: string | null;
  injuries: string | null;
  notes: string | null;
}

export type CoachProfileInput = Partial<{
  goal: string | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  height_cm: number | null;
  experience: string | null;
  days_per_week: number | null;
  equipment: string | null;
  diet_notes: string | null;
  injuries: string | null;
  notes: string | null;
}>;

export interface CoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export type AgentId = "general" | "meal" | "training";

export interface CoachSession {
  id: string;
  title: string;
  agent: AgentId;
  updated_at: string;
  message_count: number;
}

export interface CoachMemory {
  summary: string;
  updated_at: string;
}

export interface MealItem {
  name: string;
  quantity?: string;
  calories: number;
  protein_g: number;
}

export interface MealLog {
  id: string;
  date: string;
  title: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
  source: "ai" | "photo" | "manual";
}

export interface MealLogCreate {
  date: string;
  title: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
  source: "ai" | "photo" | "manual";
}

export interface MealAnalysis {
  title: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
  confidence: "low" | "medium" | "high";
  question?: string;
}

/** A change the coach has prepared and the user must confirm. */
export type CoachProposal =
  | {
      kind: "plan_update";
      plan_id: string;
      plan_name: string;
      name: string;
      source: "manual" | "ai_parsed";
      days: { day_name: string; exercises: { name: string; sets: number; reps: string }[] }[];
      summary: string;
    }
  | { kind: "plan_activate"; plan_id: string; plan_name: string }
  | { kind: "plan_delete"; plan_id: string; plan_name: string }
  | {
      kind: "set_update";
      set_id: string;
      date: string;
      exercise: string;
      from: { weight_kg: number; reps: number };
      to: { weight_kg: number; reps: number };
    }
  | {
      kind: "set_delete";
      set_id: string;
      date: string;
      exercise: string;
      weight_kg: number;
      reps: number;
    }
  | {
      kind: "meal_log";
      date: string;
      title: string;
      items: MealItem[];
      calories: number;
      protein_g: number;
    }
  | {
      kind: "meal_update";
      meal_id: string;
      date: string;
      title: string;
      items: MealItem[];
      calories: number;
      protein_g: number;
    }
  | {
      kind: "meal_delete";
      meal_id: string;
      date: string;
      title: string;
      calories: number;
      protein_g: number;
    };
