export type StrengthTrend = 'up' | 'flat' | 'down';
export type Verdict = 'hold' | 'adjust_calories' | 'check_recovery';

export interface VerdictInput {
  /** Slope of weekly average weight, kg per week (negative = losing). */
  weightTrendKgPerWeek: number;
  /** This week vs last week strength direction. */
  strengthTrend: StrengthTrend;
  /** Consecutive weeks (incl. current) where strengthTrend was 'down'. */
  strengthDownWeeks: number;
  /** Consecutive weeks (incl. current) where week-over-week weight change was > -0.2kg (stalled). */
  stalledWeeks: number;
  /** Protein-target adherence this week, 0-100. */
  adherencePct: number;
}

export interface VerdictResult {
  verdict: Verdict;
  weightTrendKgPerWeek: number;
  strengthTrend: StrengthTrend;
  adherencePct: number;
  reasoning: string[];
}

const f = (n: number) => n.toFixed(2);

/**
 * Deterministic, pure weekly-verdict rule engine. First match wins, in
 * priority order (see docs/backend.md). No I/O — fully testable with
 * fixtures. The model never generates this text (see product.md).
 */
export function evaluateVerdict(input: VerdictInput): VerdictResult {
  const { weightTrendKgPerWeek, strengthTrend, strengthDownWeeks, stalledWeeks, adherencePct } = input;

  if (strengthDownWeeks >= 2) {
    return {
      verdict: 'check_recovery',
      weightTrendKgPerWeek,
      strengthTrend,
      adherencePct,
      reasoning: [
        'Strength trending down for 2+ consecutive weeks',
        'Check sleep, recovery, and stress before pushing intensity',
      ],
    };
  }

  if (weightTrendKgPerWeek < -0.8 && strengthTrend !== 'up') {
    return {
      verdict: 'adjust_calories',
      weightTrendKgPerWeek,
      strengthTrend,
      adherencePct,
      reasoning: [
        `Losing ${Math.abs(weightTrendKgPerWeek).toFixed(1)} kg/wk — faster than the ~0.7kg target`,
        'Strength not improving — likely too aggressive a deficit',
        'Consider increasing calories',
      ],
    };
  }

  if (stalledWeeks >= 2 && adherencePct >= 80) {
    return {
      verdict: 'adjust_calories',
      weightTrendKgPerWeek,
      strengthTrend,
      adherencePct,
      reasoning: [
        `Weight flat (${f(weightTrendKgPerWeek)} kg/wk) for 2+ weeks`,
        `Protein adherence ${adherencePct}% — tracking looks solid, so intake is likely underestimated`,
        'Consider decreasing calories or investigating',
      ],
    };
  }

  return {
    verdict: 'hold',
    weightTrendKgPerWeek,
    strengthTrend,
    adherencePct,
    reasoning: [
      `Weight trend ${f(weightTrendKgPerWeek)} kg/wk — on target (0.3–0.8 loss band)`,
      `Strength ${strengthTrend} this week`,
      `Protein hit ${adherencePct}% of days`,
    ],
  };
}
