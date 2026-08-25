import { describe, it, expect } from 'vitest';
import { evaluateVerdict } from '@/lib/services/verdictEngine';

describe('evaluateVerdict', () => {
  it('branch 1: strength down 2+ weeks → check_recovery', () => {
    const r = evaluateVerdict({
      weightTrendKgPerWeek: -0.5,
      strengthTrend: 'down',
      strengthDownWeeks: 2,
      stalledWeeks: 0,
      adherencePct: 50,
    });
    expect(r.verdict).toBe('check_recovery');
  });

  it('branch 2: losing too fast and not gaining strength → adjust_calories', () => {
    const r = evaluateVerdict({
      weightTrendKgPerWeek: -0.9,
      strengthTrend: 'flat',
      strengthDownWeeks: 1,
      stalledWeeks: 0,
      adherencePct: 50,
    });
    expect(r.verdict).toBe('adjust_calories');
    expect(r.reasoning.some((s) => /increas/i.test(s))).toBe(true);
  });

  it('branch 3: stalled 2+ weeks with good adherence → adjust_calories', () => {
    const r = evaluateVerdict({
      weightTrendKgPerWeek: -0.1,
      strengthTrend: 'up',
      strengthDownWeeks: 0,
      stalledWeeks: 2,
      adherencePct: 85,
    });
    expect(r.verdict).toBe('adjust_calories');
    expect(r.reasoning.some((s) => /decreas/i.test(s))).toBe(true);
  });

  it('default: signals on track → hold', () => {
    const r = evaluateVerdict({
      weightTrendKgPerWeek: -0.5,
      strengthTrend: 'up',
      strengthDownWeeks: 0,
      stalledWeeks: 0,
      adherencePct: 86,
    });
    expect(r.verdict).toBe('hold');
  });

  it('boundary: weight trend exactly -0.8 is NOT "too fast"', () => {
    const r = evaluateVerdict({
      weightTrendKgPerWeek: -0.8,
      strengthTrend: 'flat',
      strengthDownWeeks: 1,
      stalledWeeks: 0,
      adherencePct: 50,
    });
    expect(r.verdict).toBe('hold');
  });

  it('boundary: weight trend -0.2 is NOT stalled when no stalled weeks', () => {
    const r = evaluateVerdict({
      weightTrendKgPerWeek: -0.2,
      strengthTrend: 'up',
      strengthDownWeeks: 0,
      stalledWeeks: 0,
      adherencePct: 85,
    });
    expect(r.verdict).toBe('hold');
  });

  it('boundary: weight trend -0.19 with 2 stalled weeks → adjust_calories', () => {
    const r = evaluateVerdict({
      weightTrendKgPerWeek: -0.19,
      strengthTrend: 'up',
      strengthDownWeeks: 0,
      stalledWeeks: 2,
      adherencePct: 85,
    });
    expect(r.verdict).toBe('adjust_calories');
  });

  it('strength down 1 week does not trigger check_recovery on its own', () => {
    const r = evaluateVerdict({
      weightTrendKgPerWeek: -0.9,
      strengthTrend: 'down',
      strengthDownWeeks: 1,
      stalledWeeks: 0,
      adherencePct: 50,
    });
    expect(r.verdict).toBe('adjust_calories');
  });
});
