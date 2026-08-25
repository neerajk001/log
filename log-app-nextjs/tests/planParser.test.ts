import { describe, it, expect } from 'vitest';
import { validatePlanParse, type ParsedPlan } from '@/lib/services/planParser';
import { ApiError } from '@/lib/error';

const good: ParsedPlan = {
  days: [
    {
      day_name: 'Push',
      exercises: [{ name: 'Barbell Bench Press', sets: 5, reps: '5' }],
    },
    {
      day_name: 'Pull',
      exercises: [
        { name: 'Deadlift', sets: 3, reps: '5' },
        { name: 'Pull-up', sets: 4, reps: '8-12' },
      ],
    },
  ],
};

describe('validatePlanParse', () => {
  it('accepts well-formed model output', () => {
    expect(validatePlanParse(good)).toEqual(good);
  });

  it('coerces string sets to a number', () => {
    const parsed = validatePlanParse({
      days: [{ day_name: 'A', exercises: [{ name: 'Squat', sets: '4', reps: '6' }] }],
    });
    expect(parsed.days[0].exercises[0].sets).toBe(4);
  });

  it('rejects missing days array as PARSE_FAILED', () => {
    expect(() => validatePlanParse({})).toThrow(ApiError);
    try {
      validatePlanParse({});
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('PARSE_FAILED');
      expect((e as ApiError).status).toBe(422);
    }
  });

  it('rejects a day with no exercises', () => {
    expect(() =>
      validatePlanParse({ days: [{ day_name: 'Empty', exercises: [] }] }),
    ).toThrow(ApiError);
  });

  it('rejects an exercise missing reps', () => {
    expect(() =>
      validatePlanParse({
        days: [{ day_name: 'A', exercises: [{ name: 'Squat', sets: 4 } as never] }],
      }),
    ).toThrow(ApiError);
  });

  it('rejects non-array days', () => {
    expect(() => validatePlanParse({ days: 'nope' } as never)).toThrow(ApiError);
  });
});
