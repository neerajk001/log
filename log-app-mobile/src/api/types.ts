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
  /** Weekdays the athlete doesn't train (0 = Sun … 6 = Sat). */
  rest_days?: number[] | null;
  /** Onboarding toggles; undefined means "assume on". */
  meal_tracking_enabled?: boolean;
  ai_coach_enabled?: boolean;
  /** Off = doesn't weigh themselves: no weigh-in tile, verdict judges strength. */
  track_weight?: boolean;
  /** Null until first-run onboarding is finished. */
  onboarded_at?: string | null;
}

/** First-run onboarding payload — every field optional. */
export interface OnboardingInput {
  goal?: string | null;
  sex?: "male" | "female" | "other" | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  target_weight_kg?: number | null;
  experience?: "beginner" | "intermediate" | "advanced" | null;
  days_per_week?: number | null;
  rest_days?: number[] | null;
  meal_tracking_enabled?: boolean;
  ai_coach_enabled?: boolean;
}

export interface PlanExercise {
  name: string;
  sets: number;
  reps: string;
  /** Optional target weight the athlete plans to lift. */
  weight_kg?: number | null;
}

export interface PlanDay {
  id: string;
  day_name: string;
  /** The coach's one-line "why this day" (absent on manual/imported plans). */
  rationale?: string | null;
  day_order: number;
  exercises: PlanExercise[];
}

export interface WorkoutPlan {
  id: string;
  name: string;
  source: "manual" | "ai_parsed";
  /** The coach's "why this program" summary (absent on manual/imported plans). */
  rationale?: string | null;
  is_active: boolean;
  created_at: string;
  days: PlanDay[];
}

export interface ParsedPlanPreview {
  /** The coach's "why this program" summary. */
  rationale?: string | null;
  days: { day_name: string; rationale?: string | null; exercises: PlanExercise[] }[];
}

export interface PlanTodayExercise extends PlanExercise {
  weight_kg: number | null;
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
  /** Omitted = leave the stored rationale untouched (it's coach-authored). */
  rationale?: string | null;
  days: { day_name: string; rationale?: string | null; exercises: PlanExercise[] }[];
  /** Defaults to true server-side; a duplicate sends false so a copy doesn't take over. */
  is_active?: boolean;
}

export type VerdictKind = "hold" | "adjust_calories" | "check_recovery";
export type StrengthTrend = "up" | "flat" | "down";

export interface VerdictResponse {
  verdict: VerdictKind;
  week_start_date: string;
  weight_trend_kg_per_week: number | null;
  strength_trend: StrengthTrend | null;
  adherence_pct: number | null;
  /** Days this week the calorie target was met (null when no target is set). */
  calorie_adherence_pct: number | null;
  /** Last week's verdict, for "same as last week" / "changed from". */
  previous_verdict: VerdictKind | null;
  /** What was actually logged this week — the verdict's inputs. */
  week: {
    workouts: number;
    sets: number;
    days_logged: number;
    avg_calories: number | null;
    avg_protein_g: number | null;
  };
  reasoning: string[];
}

/** One bucket of the Insights series — width follows the requested range. */
export interface TrendBucket {
  start: string;
  weight_kg: number | null;
  calories: number | null;
  protein_g: number | null;
  /** Completed days that actually had calories/protein — the basis for the averages. */
  days: number;
}

/** One month of the consistency rollup. */
export interface MonthSummary {
  month_start: string;
  workouts: number;
  days_logged: number;
  calories: number | null;
  protein_g: number | null;
  protein_adherence_pct: number | null;
  calorie_adherence_pct: number | null;
}

export type TrendRange = "7d" | "30d" | "90d" | "1y";

export interface LiftDelta {
  exercise: string;
  this_week_kg: number | null;
  last_week_kg: number | null;
  delta: "up" | "flat" | "down";
}

export interface TrendsResponse {
  /** Bucket width: day (7d), week (30d/90d), month (1y). */
  bucket: "day" | "week" | "month";
  series: TrendBucket[];
  /** Weekly nutrient averages over the nutrition card's own window. */
  nutrition: TrendBucket[];
  /** Last six calendar months, newest first. */
  months: MonthSummary[];
  lifts: LiftDelta[];
  adherence_pct: number | null;
  calorie_adherence_pct: number | null;
}

/** The coach's read on a body photo. The image itself is never stored. */
export interface PhysiqueReading {
  analysis: string;
  headline: string | null;
  review_on: string | null;
}

/** Something the coach advised, with when to follow it up. */
export interface CoachDecision {
  id: string;
  kind: string;
  summary: string;
  topic: string | null;
  review_on: string | null;
  outcome: string | null;
  created_at: string;
}

export interface CoachProfile {
  goal: string | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  height_cm: number | null;
  sex: "male" | "female" | "other" | null;
  age: number | null;
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
  /** Unconfirmed proposals stored with this turn, rehydrated into confirmation cards. */
  proposals?: CoachProposal[] | null;
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

/** Server-measured cost/latency facts for one coach turn. */
export interface CoachUsage {
  input_tokens: number;
  output_tokens: number;
  rounds: number;
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
  /** Client-generated id: retrying the same request replays it instead of logging twice. */
  id?: string;
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
  /** Targets + what was already logged today (nulls when unset). */
  day?: {
    calorie_target: number | null;
    protein_target_g: number | null;
    calories: number | null;
    protein_g: number | null;
  } | null;
}

/** A change the coach has prepared and the user must confirm. */
export type CoachProposal = (
  | {
      kind: "plan_update";
      plan_id: string;
      plan_name: string;
      name: string;
      source: "manual" | "ai_parsed";
      /** The coach's "why this program", carried through to the preview. */
      rationale?: string;
      days: {
        day_name: string;
        rationale?: string;
        exercises: { name: string; sets: number; reps: string }[];
      }[];
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
      /** Where the estimate came from — the photo path marks it "photo". */
      source?: "ai" | "photo";
      confidence?: "low" | "medium" | "high";
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
    }
) & {
  /**
   * Server id, stable across reloads: re-confirming a restored meal proposal
   * replays the same create request instead of logging the meal twice.
   */
  id?: string;
};

/**
 * A meal estimate the athlete dismissed, sent back with their reason so the coach
 * can re-estimate from the correction (photo estimates are never stored server-side).
 */
export interface DismissedMeal {
  title: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
  date?: string;
}

/** Recent exercise names, plus the top set from each one's previous session. */
export interface LiftSummary {
  names: string[];
  last_by_exercise: LiftLog[];
}

/** One exercise's rollup from the Insights metrics endpoint. */
export interface ExerciseMetrics {
  name: string;
  sets: number;
  volume: number;
  best_kg: number;
  best_reps: number;
  best_date: string;
  prev_best_kg: number;
  current_top_kg: number;
  previous_top_kg: number;
}

/** Training days + per-exercise rollups for a range and its comparison window. */
export interface LiftMetrics {
  days: { date: string; sets: number }[];
  exercises: ExerciseMetrics[];
}
