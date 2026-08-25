import { describe, it, expect } from 'vitest';
import { resolvePlanDay } from '@/lib/services/planRotation';

const days = [
  { id: 'd1', dayName: 'Push', dayOrder: 1 },
  { id: 'd2', dayName: 'Pull', dayOrder: 2 },
  { id: 'd3', dayName: 'Legs', dayOrder: 3 },
  { id: 'd4', dayName: 'Upper', dayOrder: 4 },
  { id: 'd5', dayName: 'Lower', dayOrder: 5 },
  { id: 'd6', dayName: 'Full', dayOrder: 6 },
];

const start = new Date(Date.UTC(2026, 7, 10)); // Mon Aug 10 2026

describe('resolvePlanDay', () => {
  it('returns day 1 on the start date', () => {
    const r = resolvePlanDay(start, days, new Date(Date.UTC(2026, 7, 10)));
    expect(r).toEqual({ id: 'd1', dayName: 'Push', dayOrder: 1 });
  });

  it('rotates forward by whole days', () => {
    expect(resolvePlanDay(start, days, new Date(Date.UTC(2026, 7, 11)))?.dayOrder).toBe(2);
    expect(resolvePlanDay(start, days, new Date(Date.UTC(2026, 7, 15)))?.dayOrder).toBe(6);
  });

  it('wraps after a full cycle', () => {
    // 6 days after start -> diff 6 -> 6 % 6 + 1 = 1
    expect(resolvePlanDay(start, days, new Date(Date.UTC(2026, 7, 16)))?.dayOrder).toBe(1);
    // 8 days after -> 8 % 6 + 1 = 3
    expect(resolvePlanDay(start, days, new Date(Date.UTC(2026, 7, 18)))?.dayOrder).toBe(3);
  });

  it('returns the first day before the plan start date', () => {
    const r = resolvePlanDay(start, days, new Date(Date.UTC(2026, 7, 9)));
    expect(r?.dayOrder).toBe(1);
  });

  it('returns null when there are no plan days', () => {
    expect(resolvePlanDay(start, [], new Date(Date.UTC(2026, 7, 10)))).toBeNull();
  });

  it('handles unordered input by sorting on dayOrder', () => {
    const shuffled = [...days].reverse();
    expect(resolvePlanDay(start, shuffled, new Date(Date.UTC(2026, 7, 12)))?.dayOrder).toBe(3);
  });
});
