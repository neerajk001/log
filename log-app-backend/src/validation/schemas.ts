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
  date: dateString,
  title: z.string().min(1).max(120),
  items: z.array(mealItemSchema).min(1).max(30),
  calories: z.number().int().min(1).max(10000),
  protein_g: z.number().min(0).max(1000),
  source: z.enum(["ai", "photo", "manual"]),
});

export const updateMealSchema = createMealSchema.omit({ date: true });

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
  exercises: z.array(planExerciseSchema).min(1).max(50),
});

export const parsedPlanSchema = z.object({
  days: z.array(planDaySchema).min(1).max(14),
});

export const createPlanSchema = parsedPlanSchema.extend({
  name: z.string().min(1).max(200),
  source: z.enum(["manual", "ai_parsed"]),
});

export const planParseBodySchema = z.object({
  text: z.string().min(1).max(50000),
});

export const planIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const trendsQuerySchema = z.object({
  range: z.enum(["4w"]).optional(),
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
});

export const coachPlanSchema = z.object({
  goal: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
