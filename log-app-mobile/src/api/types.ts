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

export type PlateUnit = "kg" | "lb";

/** Machine stack calibration: estimated load = position × increment. */
export interface PlateConfig {
  unit: PlateUnit;
  increment: number;
  /** 1-based stack positions; `min_position` is usually 1. */
  min_position: number;
  max_position: number;
}

/** A logged set's load: kg, bodyweight, or a numbered machine position. */
export interface LiftSetLoad {
  /** Null = bodyweight or plate-stack set. */
  weight_kg: number | null;
  reps: number;
  plate_position?: number | null;
  plate_increment?: number | null;
  plate_unit?: PlateUnit | null;
}

export interface LiftLog extends LiftSetLoad {
  id: string;
  date: string;
  exercise_name: string;
  plate_position: number | null;
  plate_increment: number | null;
  plate_unit: PlateUnit | null;
  plan_day_id: string | null;
}

export interface LiftLogCreate {
  id?: string;
  date: string;
  exercise_name: string;
  /** Null = bodyweight or plate-stack set. */
  weight_kg?: number | null;
  reps: number;
  plate_position?: number | null;
  plate_increment?: number | null;
  plate_unit?: PlateUnit | null;
  plan_day_id?: string | null;
}

export interface LiftLogUpdate {
  weight_kg: number | null;
  reps: number;
  /** Omit to keep the set's existing plate position. */
  plate_position?: number | null;
  plate_increment?: number | null;
  plate_unit?: PlateUnit | null;
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

export type PlanTier = "free" | "pro";

export interface UserProfile {
  id: string;
  protein_target_g: number | null;
  calorie_target: number | null;
  /** Entitlement. `is_pro` covers an active trial or an unexpired subscription. */
  plan_tier?: PlanTier;
  trial_ends_at?: string | null;
  pro_until?: string | null;
  is_pro?: boolean;
  is_trial?: boolean;
  trial_days_left?: number | null;
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

/** One billable AI surface. `limit` is null when unlimited (Pro or trial). */
export type ProFeature =
  | "chat"
  | "meal_scan"
  | "plan_generate"
  | "plan_parse"
  | "physique";

export interface FeatureUsage {
  feature: ProFeature;
  used: number;
  limit: number | null;
  /** ISO date the allowance next resets. */
  resets_on: string;
  allowed: boolean;
}

/** Dev-only plan states, mirroring `POST /api/billing/dev/simulate`. */
export type DevPlanMode = "free" | "trial" | "trial_expired" | "pro";

/** `GET /api/billing/status` — entitlement plus this period's usage. */
export interface BillingStatus {
  plan_tier: PlanTier;
  is_pro: boolean;
  is_trial: boolean;
  trial_ends_at: string | null;
  trial_days_left: number | null;
  pro_until: string | null;
  purchase_enabled: boolean;
  features: FeatureUsage[];
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

/** One set's prescription. Both fields optional: `{}` means "use the exercise defaults". */
export interface PlanSetTarget {
  weight_kg?: number | null;
  reps?: string | null;
}

export interface PlanExercise {
  name: string;
  sets: number;
  reps: string;
  /** Optional target weight the athlete plans to lift (the default for every set). */
  weight_kg?: number | null;
  /** Per-set targets in set order (entry 1 = set 1); optional. */
  set_targets?: PlanSetTarget[] | null;
  /** How the exercise is loaded. Absent = free weights (kg). */
  load_mode?: "weight" | "plate";
  /** Optional calibration for machine plate-stack exercises. */
  plate_config?: PlateConfig | null;
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
  load_mode: "weight" | "plate";
  plate_config: PlateConfig | null;
  logged: boolean;
  last_log: LiftSetLoad | null;
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

/** The detailed body/nutrition analysis excludes the 7-day overview. */
export type BodyAnalysisRange = "30d" | "90d" | "1y";

export interface BodyAnalysisMacro {
  target: number | null;
  average: number | null;
  /** Calories: days within ±5% of target. Protein: days at or above target. */
  hit_rate_pct: number | null;
  days_logged: number;
  weekday_avg: number | null;
  weekend_avg: number | null;
  variability: number | null;
}

export interface BodyAnalysisWeightPoint {
  date: string;
  kg: number;
  calories: number | null;
  protein_g: number | null;
}

export interface BodyAnalysisDayPattern {
  day: number;
  label: string;
  calories: number | null;
  protein_g: number | null;
  days: number;
}

export interface BodyAnalysisPrevious {
  from: string;
  to: string;
  weight_rate_kg_per_week: number | null;
  calories_average: number | null;
  protein_hit_rate_pct: number | null;
  weigh_ins: number;
  calories_days: number;
}

export interface BodyAnalysis {
  range: BodyAnalysisRange;
  from: string;
  to: string;
  data_quality: {
    days: number;
    days_with_calories: number;
    days_with_protein: number;
    weigh_ins: number;
    coverage_pct: number;
    sufficient: boolean;
  };
  weight: {
    latest_kg: number | null;
    average_7d_kg: number | null;
    start_kg: number | null;
    change_kg: number | null;
    rate_kg_per_week: number | null;
    plateau: boolean;
    weigh_ins: number;
    points: BodyAnalysisWeightPoint[];
    goal: {
      target_kg: number | null;
      direction: "losing" | "gaining" | "maintaining" | null;
      weeks_to_target: number | null;
      target_date: string | null;
    } | null;
  };
  calories: BodyAnalysisMacro;
  protein: BodyAnalysisMacro & { grams_per_kg: number | null };
  weekly_pattern: BodyAnalysisDayPattern[];
  previous: BodyAnalysisPrevious | null;
  implied_maintenance: {
    kcal: number;
    low: number;
    high: number;
    span_days: number;
    logged_days: number;
    note: string;
  } | null;
  insights: string[];
}

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
  /** The range actually served (the server clamps Free accounts to 7d). */
  range?: TrendRange;
  limited?: boolean;
  max_days?: number | null;
}

/** The coach's read on a one-off body photo (the image itself is never stored). */
export interface PhysiqueReading {
  analysis: string;
  headline: string | null;
  review_on: string | null;
}

export type PhysiqueRecommendationArea = "training" | "nutrition" | "recovery";

export interface PhysiqueRecommendation {
  area: PhysiqueRecommendationArea;
  action: string;
  reason: string;
}

/** A stored weekly check-in. The image is encrypted at rest, never in this payload. */
export interface PhysiqueCheckin {
  id: string;
  date: string;
  week_start_date: string;
  headline: string;
  assessment: string;
  recommendations: PhysiqueRecommendation[];
  previous_checkin_id: string | null;
  image_bytes: number;
  created_at: string;
  updated_at: string;
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
        exercises: PlanExercise[];
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
      from: LiftSetLoad;
      to: LiftSetLoad;
    }
  | {
      kind: "set_delete";
      set_id: string;
      date: string;
      exercise: string;
      weight_kg: number | null;
      reps: number;
      plate_position?: number | null;
      plate_increment?: number | null;
      plate_unit?: PlateUnit | null;
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

/** One previous session's sets, in the order they were logged. */
export interface LastSessionSets {
  date: string;
  sets: LiftSetLoad[];
}

/** Recent exercise names, plus the top set from each one's previous session. */
export interface LiftSummary {
  names: string[];
  last_by_exercise: LiftLog[];
  /** Every set of each exercise's previous session, for set-by-set pre-filling. */
  last_sets_by_exercise: Record<string, LastSessionSets>;
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

export type LiftProgressMode = "kg" | "plate" | "bw";

/** Best set of one session, shaped like a logged set for the shared formatters. */
export interface LiftProgressBestSet {
  weight_kg: number | null;
  reps: number;
  plate_position: number | null;
  plate_increment: number | null;
  plate_unit: PlateUnit | null;
}

export interface LiftProgressPoint {
  date: string;
  sets: number;
  reps: number;
  /** Kg volume only; plate and bodyweight sets contribute zero. */
  volume: number;
  /** Weight, stack position, or reps depending on the exercise's mode. */
  top_value: number | null;
  best_set: LiftProgressBestSet;
}

export interface LiftProgressExercise {
  name: string;
  mode: LiftProgressMode;
  sessions: number;
  sets: number;
  volume: number;
  best_value: number | null;
  previous_best_value: number | null;
  /** Kg only; plate/bodyweight changes are reported as a raw delta. */
  change_pct: number | null;
  /** Kg, positions, or reps depending on the mode. */
  change_value: number | null;
  best_set: LiftProgressBestSet;
  points: LiftProgressPoint[];
}

export interface LiftProgress {
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
  exercises: LiftProgressExercise[];
  /** True when the server clamped a wider window to the free allowance. */
  limited?: boolean;
  max_days?: number | null;
}
