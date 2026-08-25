import { z } from 'zod';

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const dailyLogSchema = z
  .object({
    weight_kg: z.number().positive().max(999),
    calories: z.number().int().positive().max(99999),
    protein_g: z.number().int().positive().max(99999),
    sleep_hours: z.number().positive().max(24),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'at least one field is required',
  });

export const rangeQuerySchema = z
  .object({
    from: dateStr.optional(),
    to: dateStr.optional(),
  })
  .refine((d) => !d.from || !d.to || d.from <= d.to, {
    message: 'from must be before or equal to to',
  });

export const liftLogSchema = z.object({
  date: dateStr,
  exercise_name: z.string().min(1).max(200),
  weight_kg: z.number().positive().max(9999),
  reps: z.number().int().positive().max(9999),
  plan_day_id: z.string().uuid().nullable().optional(),
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

export const meUpdateSchema = z
  .object({
    protein_target_g: z.number().int().positive().max(9999),
    calorie_target: z.number().int().positive().max(99999),
    daily_defaults: dailyDefaultsSchema,
  })
  .partial();

export const planExerciseSchema = z.object({
  name: z.string().min(1).max(200),
  sets: z.number().int().positive().max(99),
  reps: z.string().min(1).max(20),
});

export const planDayInputSchema = z.object({
  day_name: z.string().min(1).max(60),
  exercises: z.array(planExerciseSchema).min(1),
});

export const planCreateSchema = z.object({
  name: z.string().min(1).max(120),
  source: z.enum(['manual', 'ai_parsed']),
  days: z.array(planDayInputSchema).min(1),
});
