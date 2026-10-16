import { z } from "zod";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    );
  }, "date must be a valid calendar date");

export const dailyLogSchema = z.object({
  weight_kg: z.number().positive().max(999).optional().nullable(),
  calories: z.number().int().positive().max(99999).optional().nullable(),
  protein_g: z.number().int().positive().max(99999).optional().nullable(),
  sleep_hours: z.number().positive().max(24).optional().nullable(),
});

export const liftLogSchema = z.object({
  id: z.string().uuid().optional(),
  date: dateString,
  exercise_name: z.string().min(1).max(120),
  weight_kg: z.number().positive().max(9999),
  reps: z.number().int().positive().max(9999),
  plan_day_id: z.string().uuid().optional().nullable(),
});

export const liftLogUpdateSchema = z.object({
  weight_kg: z.number().positive().max(9999),
  reps: z.number().int().positive().max(9999),
});

export const mealItemSchema = z.object({
  name: z.string().min(1).max(120),
  quantity: z.string().max(60).optional(),
  calories: z.number().int().min(0).max(5000),
  protein_g: z.number().min(0).max(500),
});

export const createMealSchema = z.object({
  /** Optional client-generated id: retrying the same request replays it instead of logging the meal twice. */
  id: z.string().uuid().optional(),
  date: dateString,
  title: z.string().min(1).max(120),
  items: z.array(mealItemSchema).min(1).max(30),
  calories: z.number().int().min(1).max(10000),
  protein_g: z.number().min(0).max(1000),
  source: z.enum(["ai", "photo", "manual"]),
});

export const updateMealSchema = createMealSchema.omit({ date: true, id: true });

export const mealDateQuerySchema = z.object({
  date: dateString,
});

export const dailyDefaultsSchema = z
  .object({
    weight_kg: z.number().positive().max(999).nullable().optional(),
    calories: z.number().int().positive().max(99999).nullable().optional(),
    protein_g: z.number().int().positive().max(99999).nullable().optional(),
    sleep_hours: z.number().positive().max(24).nullable().optional(),
  })
  .partial()
  .nullable();

export const updateMeSchema = z.object({
  protein_target_g: z.number().int().positive().optional().nullable(),
  calorie_target: z.number().int().positive().optional().nullable(),
  /** Off = doesn't weigh themselves; the verdict judges strength and adherence instead. */
  track_weight: z.boolean().optional(),
  daily_defaults: dailyDefaultsSchema.optional(),
  /** Weekdays the athlete doesn't train (0 = Sun … 6 = Sat) — they don't break the streak. */
  rest_days: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  meal_tracking_enabled: z.boolean().optional(),
  ai_coach_enabled: z.boolean().optional(),
  /** Set the first-run onboarding flag (dev/testing helper). */
  onboarded: z.boolean().optional(),
});

export const activityTypeSchema = z.enum(["run", "cycle", "walk", "swim", "other"]);

export const activityLogSchema = z.object({
  date: dateString,
  activity_type: activityTypeSchema,
  name: z.string().min(1).max(200),
  duration_min: z.number().int().positive().max(9999),
  distance_km: z.number().positive().max(9999).optional().nullable(),
  calories_burned: z.number().int().positive().max(99999).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const dateParamSchema = z.object({
  date: dateString,
});

export const dailyLogsQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
});

export const liftLogsQuerySchema = z
  .object({
    exercise: z.string().min(1).max(120).optional(),
    weeks: z.coerce.number().int().positive().max(52).optional(),
    date: dateString.optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    days: z.coerce.number().int().positive().max(365).optional(),
  })
  .refine((d) => d.exercise || d.date || d.from || d.to || d.days, {
    message: "Provide exercise, or a date range via from/to/days",
  });

export const planExerciseSchema = z.object({
  name: z.string().min(1).max(120),
  sets: z.number().int().positive().max(99),
  reps: z.string().min(1).max(20),
  /** Optional target weight the athlete plans to lift. */
  weight_kg: z.number().positive().max(9999).optional(),
});

export const planDaySchema = z.object({
  day_name: z.string().min(1).max(200),
  /** The coach's one-line "why this day" (absent on manual/imported plans). */
  rationale: z.string().max(500).optional(),
  exercises: z.array(planExerciseSchema).min(1).max(50),
});

export const parsedPlanSchema = z.object({
  /** The coach's "why this program" summary (absent on manual/imported plans). */
  rationale: z.string().max(800).optional(),
  days: z.array(planDaySchema).min(1).max(14),
});

export const createPlanSchema = parsedPlanSchema.extend({
  name: z.string().min(1).max(200),
  source: z.enum(["manual", "ai_parsed"]),
  /**
   * Whether the new plan becomes the active one (default true). Duplicating a plan sends
   * false, so making a copy no longer steals the active slot.
   */
  is_active: z.boolean().optional(),
});

export const planParseBodySchema = z.object({
  text: z.string().min(1).max(50000),
});

export const planIdParamSchema = z.object({
  id: z.string().uuid(),
});

/** `/api/plans/:id/today` — the athlete's local date, since the server runs on UTC. */
export const planTodayQuerySchema = z.object({
  date: dateString.optional(),
});

/** `GET /api/plans?active=1` — only the active plan (lighter payload). */
export const planListQuerySchema = z.object({
  active: z.enum(["1"]).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

/** `/api/logs/lift/summary` — recent exercise names + each one's last session. */
export const liftSummaryQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(730).optional(),
  before: dateString.optional(),
});

/** `/api/logs/lift/metrics` — the current and previous comparison windows. */
export const liftMetricsQuerySchema = z.object({
  from: dateString,
  to: dateString,
  prev_from: dateString,
  prev_to: dateString,
});

export const trendsQuerySchema = z.object({
  /** Bucket width follows the range: day (7d), week (30d/90d), month (1y). */
  range: z.enum(["7d", "30d", "90d", "1y"]).optional(),
  /** Weekly nutrient window for the nutrition card (1–52 weeks). */
  weeks: z.coerce.number().int().min(1).max(52).optional(),
  /** The athlete's local date — the server's UTC day can be behind it. */
  date: dateString.optional(),
});

export type ParsedPlan = z.infer<typeof parsedPlanSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const sexSchema = z.enum(["male", "female", "other"]);

export const coachProfileSchema = z.object({
  goal: z.string().max(200).optional().nullable(),
  weight_kg: z.number().positive().max(999).optional().nullable(),
  target_weight_kg: z.number().positive().max(999).optional().nullable(),
  height_cm: z.number().int().positive().max(300).optional().nullable(),
  sex: sexSchema.optional().nullable(),
  age: z.number().int().min(13).max(100).optional().nullable(),
  experience: z.enum(["beginner", "intermediate", "advanced"]).optional().nullable(),
  days_per_week: z.number().int().min(1).max(7).optional().nullable(),
  equipment: z.string().max(200).optional().nullable(),
  diet_notes: z.string().max(1000).optional().nullable(),
  injuries: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/** First-run onboarding: profile answers + user preferences, all optional. */
export const onboardingSchema = z.object({
  goal: z.string().max(200).optional().nullable(),
  sex: sexSchema.optional().nullable(),
  age: z.number().int().min(13).max(100).optional().nullable(),
  height_cm: z.number().int().positive().max(300).optional().nullable(),
  weight_kg: z.number().positive().max(999).optional().nullable(),
  target_weight_kg: z.number().positive().max(999).optional().nullable(),
  experience: z.enum(["beginner", "intermediate", "advanced"]).optional().nullable(),
  days_per_week: z.number().int().min(1).max(7).optional().nullable(),
  rest_days: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  meal_tracking_enabled: z.boolean().optional(),
  ai_coach_enabled: z.boolean().optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const coachChatSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().uuid().optional(),
  /** The athlete's local date (server may be on UTC). */
  localDate: dateString.optional(),
  /** Explicit agent pick (UI chips). Omit to let the router decide. */
  agent: z.enum(["general", "meal", "training"]).optional(),
  /**
   * A meal estimate the athlete just dismissed. Carries the estimate back to the
   * model (photo estimates are never stored server-side, so the client has to send
   * it) while `message` holds their reason — so it can re-estimate from the
   * correction instead of repeating itself.
   */
  dismissedMeal: z
    .object({
      title: z.string().max(120),
      items: z
        .array(
          z.object({
            name: z.string().max(120),
            quantity: z.string().max(60).optional(),
            calories: z.number().min(0).max(5000),
            protein_g: z.number().min(0).max(500),
          }),
        )
        .max(30),
      calories: z.number().min(0).max(20000),
      protein_g: z.number().min(0).max(1000),
      date: dateString.optional(),
    })
    .optional(),
});

export const coachPlanSchema = z.object({
  goal: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
