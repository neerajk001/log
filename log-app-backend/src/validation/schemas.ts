import { z } from "zod";

export const dailyLogSchema = z.object({
  weight_kg: z.number().positive().optional().nullable(),
  calories: z.number().int().positive().optional().nullable(),
  protein_g: z.number().int().positive().optional().nullable(),
  sleep_hours: z.number().min(0).max(24).optional().nullable(),
});

export const liftLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  exercise_name: z.string().min(1),
  weight_kg: z.number().positive(),
  reps: z.number().int().positive(),
  plan_day_id: z.string().uuid().optional().nullable(),
});

export const updateMeSchema = z.object({
  protein_target_g: z.number().int().positive().optional().nullable(),
  calorie_target: z.number().int().positive().optional().nullable(),
});

export const dateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export const dailyLogsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const liftLogsQuerySchema = z.object({
  exercise: z.string().optional(),
  weeks: z.coerce.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((d) => d.exercise || d.date, { message: "exercise or date is required" });

export const planExerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.number().int().positive(),
  reps: z.string().min(1),
});

export const planDaySchema = z.object({
  day_name: z.string().min(1),
  exercises: z.array(planExerciseSchema).min(1),
});

export const parsedPlanSchema = z.object({
  days: z.array(planDaySchema).min(1),
});

export const createPlanSchema = parsedPlanSchema.extend({
  name: z.string().min(1),
  source: z.enum(["manual", "ai_parsed"]),
});

export const planParseBodySchema = z.object({
  text: z.string().min(1),
});

export const planIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const trendsQuerySchema = z.object({
  range: z.enum(["4w"]).optional(),
});

export type ParsedPlan = z.infer<typeof parsedPlanSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
