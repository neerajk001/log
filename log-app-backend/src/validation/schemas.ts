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

export const liftLogSchema = z
  .object({
    id: z.string().uuid().optional(),
    date: dateString,
    exercise_name: z.string().min(1).max(120),
    /**
     * Null = bodyweight set (reps only) or a machine plate-stack set. Plate sets
     * carry `plate_position` instead of a weight.
     */
    weight_kg: z.number().positive().max(9999).nullable(),
    reps: z.number().int().positive().max(9999),
    /** Numbered stack position (1-based) for machine exercises. */
    plate_position: z.number().int().min(1).max(999).optional().nullable(),
    /** Calibration snapshot: load added per stack position, in `plate_unit`. */
    plate_increment: z.number().positive().max(9999).optional().nullable(),
    plate_unit: z.enum(["kg", "lb"]).optional().nullable(),
    plan_day_id: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.weight_kg != null && data.plate_position != null) {
      ctx.addIssue({
        code: "custom",
        path: ["plate_position"],
        message: "a set cannot have both weight_kg and plate_position",
      });
    }
    if ((data.plate_increment == null) !== (data.plate_unit == null)) {
      ctx.addIssue({
        code: "custom",
        path: ["plate_increment"],
        message: "plate_increment and plate_unit must be provided together",
      });
    }
    if (
      data.plate_position == null &&
      (data.plate_increment != null || data.plate_unit != null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["plate_position"],
        message: "plate_position is required with plate calibration",
      });
    }
  });

export const liftLogUpdateSchema = z
  .object({
    /** Null = bodyweight or plate set: clears any stored kg load. */
    weight_kg: z.number().positive().max(9999).nullable(),
    reps: z.number().int().positive().max(9999),
    plate_position: z.number().int().min(1).max(999).optional().nullable(),
    plate_increment: z.number().positive().max(9999).optional().nullable(),
    plate_unit: z.enum(["kg", "lb"]).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.weight_kg != null && data.plate_position != null) {
      ctx.addIssue({
        code: "custom",
        path: ["plate_position"],
        message: "a set cannot have both weight_kg and plate_position",
      });
    }
    if ((data.plate_increment !== undefined) !== (data.plate_unit !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["plate_increment"],
        message: "plate_increment and plate_unit must be provided together",
      });
    }
    if ((data.plate_increment == null) !== (data.plate_unit == null)) {
      ctx.addIssue({
        code: "custom",
        path: ["plate_increment"],
        message: "plate_increment and plate_unit must be provided together",
      });
    }
    if (
      data.plate_position == null &&
      (data.plate_increment != null || data.plate_unit != null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["plate_position"],
        message: "plate_position is required with plate calibration",
      });
    }
  });

export const mealItemSchema = z.object({
  name: z.string().min(1).max(120),
  quantity: z.string().max(60).optional(),
  calories: z.number().int().min(0).max(5000),
  protein_g: z.number().min(0).max(500),
});

const mealBodySchema = z.object({
  title: z.string().min(1).max(120),
  items: z.array(mealItemSchema).min(1).max(30),
  calories: z.number().int().min(1).max(10000),
  protein_g: z.number().int().min(0).max(1000),
  source: z.enum(["ai", "photo", "manual"]),
});

function mealTotalsMatch(
  data: { items: { calories: number; protein_g: number }[]; calories: number; protein_g: number },
  ctx: z.RefinementCtx,
): void {
  const calories = data.items.reduce((sum, item) => sum + item.calories, 0);
  const protein = data.items.reduce((sum, item) => sum + item.protein_g, 0);
  if (Math.abs(data.calories - calories) > 1) {
    ctx.addIssue({
      code: "custom",
      path: ["calories"],
      message: "calories must match the sum of the items",
    });
  }
  if (Math.abs(data.protein_g - protein) > 1) {
    ctx.addIssue({
      code: "custom",
      path: ["protein_g"],
      message: "protein_g must match the sum of the items",
    });
  }
}

export const createMealSchema = z
  .object({
    /** Optional client-generated id: retrying the same request replays it instead of logging the meal twice. */
    id: z.string().uuid().optional(),
    date: dateString,
    ...mealBodySchema.shape,
  })
  .superRefine(mealTotalsMatch);

export const updateMealSchema = mealBodySchema.superRefine(mealTotalsMatch);

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

/** One set's prescription. Both fields optional: `{}` means "use the exercise's defaults". */
export const planSetTargetSchema = z.object({
  weight_kg: z.number().positive().max(9999).optional().nullable(),
  reps: z.string().min(1).max(20).optional(),
});

/**
 * Machine plate-stack calibration. `increment` is the load one numbered stack
 * position represents, so estimated load = position × increment. Both positions
 * are 1-based; `min_position` is usually 1.
 */
export const plateConfigSchema = z
  .object({
    unit: z.enum(["kg", "lb"]),
    increment: z.number().positive().max(9999),
    /** Optional bounds; the app normally only asks for load per position. */
    min_position: z.number().int().min(1).max(999).default(1),
    max_position: z.number().int().min(1).max(999).default(999),
  })
  .refine((c) => c.max_position >= c.min_position, {
    message: "max_position must be greater than or equal to min_position",
    path: ["max_position"],
  });

export const planExerciseSchema = z
  .object({
    name: z.string().min(1).max(120),
    sets: z.number().int().positive().max(99),
    reps: z.string().min(1).max(20),
    /** Optional target weight the athlete plans to lift (free-weight mode). */
    weight_kg: z.number().positive().max(9999).optional(),
    /**
     * Per-set targets in set order (entry 1 = set 1), for pyramid work. Optional:
     * `weight_kg` stays the default for any set without its own target.
     */
    set_targets: z.array(planSetTargetSchema).max(99).optional(),
    /** How this exercise is loaded. Absent = free weights (kg). */
    load_mode: z.enum(["weight", "plate"]).optional(),
    /** Optional calibration for plate-stack exercises; absent = log position only. */
    plate_config: plateConfigSchema.optional().nullable(),
  })
  .superRefine((exercise, ctx) => {
    if (exercise.plate_config && exercise.load_mode !== "plate") {
      ctx.addIssue({
        code: "custom",
        path: ["plate_config"],
        message: "plate_config requires load_mode 'plate'",
      });
    }
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
const MAX_PROGRESS_WINDOW_DAYS = 731;

function daySpan(from: string, to: string): number {
  return (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000;
}

export const liftMetricsQuerySchema = z
  .object({
    from: dateString,
    to: dateString,
    prev_from: dateString,
    prev_to: dateString,
  })
  .superRefine((data, ctx) => {
    if (data.to < data.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "to must be on or after from" });
    }
    if (data.prev_to < data.prev_from) {
      ctx.addIssue({
        code: "custom",
        path: ["prev_to"],
        message: "prev_to must be on or after prev_from",
      });
    }
    if (data.prev_to >= data.from) {
      ctx.addIssue({
        code: "custom",
        path: ["prev_from"],
        message: "the previous window must end before from",
      });
    }
    if (daySpan(data.from, data.to) > MAX_PROGRESS_WINDOW_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `window must be ${MAX_PROGRESS_WINDOW_DAYS} days or fewer`,
      });
    }
    if (daySpan(data.prev_from, data.prev_to) > MAX_PROGRESS_WINDOW_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["prev_to"],
        message: `comparison window must be ${MAX_PROGRESS_WINDOW_DAYS} days or fewer`,
      });
    }
  });

/** `/api/logs/lift/progress` - per-exercise session history and its comparison window. */
export const liftProgressQuerySchema = liftMetricsQuerySchema;

export const trendsQuerySchema = z.object({
  /** Bucket width follows the range: day (7d), week (30d/90d), month (1y). */
  range: z.enum(["7d", "30d", "90d", "1y"]).optional(),
  /** Weekly nutrient window for the nutrition card (1–52 weeks). */
  weeks: z.coerce.number().int().min(1).max(52).optional(),
  /** The athlete's local date — the server's UTC day can be behind it. */
  date: dateString.optional(),
});

/** Detailed body/nutrition analysis window. */
export const bodyAnalysisQuerySchema = z.object({
  range: z.enum(["30d", "90d", "1y"]).optional(),
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

/**
 * Dev-only entitlement switch (`POST /api/billing/dev/simulate`). Each mode
 * reproduces one real state so every gate can be exercised without waiting.
 */
export const billingSimulateSchema = z.object({
  mode: z.enum(["free", "trial", "trial_expired", "pro"]),
});

export type DevPlanMode = z.infer<typeof billingSimulateSchema>["mode"];

/**
 * The subset of a RevenueCat webhook event the backend acts on. Unknown fields
 * are kept (`passthrough`) because RevenueCat adds fields over time; the raw
 * event is stored in `billing_events` for audit.
 */
export const revenueCatEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    app_user_id: z.string().optional(),
    original_app_user_id: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    entitlement_id: z.string().nullable().optional(),
    entitlement_ids: z.array(z.string()).nullable().optional(),
    product_id: z.string().nullable().optional(),
    new_product_id: z.string().nullable().optional(),
    expiration_at_ms: z.number().nullable().optional(),
    event_timestamp_ms: z.number().optional(),
    environment: z.string().optional(),
    store: z.string().optional(),
    price: z.number().nullable().optional(),
    cancel_reason: z.string().nullable().optional(),
    transferred_from: z.array(z.string()).optional(),
    transferred_to: z.array(z.string()).optional(),
    grace_period_expiration_at_ms: z.number().nullable().optional(),
  })
  .passthrough();

export const revenueCatWebhookSchema = z
  .object({
    event: revenueCatEventSchema,
    api_version: z.string().optional(),
  })
  .passthrough();

export type RevenueCatEvent = z.infer<typeof revenueCatEventSchema>;

export const coachChatSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().uuid().optional(),
  /** The athlete's local date (server may be on UTC). */
  localDate: dateString.optional(),
  /** Explicit agent pick (UI chips). Omit to let the router decide. */
  agent: z.enum(["general", "meal", "training"]).optional(),
  /**
   * True when the client is replaying a turn that already failed. The server
   * then stores the user message only if it isn't already the newest stored
   * turn, so retries never duplicate the prompt in history.
   */
  retry: z.boolean().optional(),
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
