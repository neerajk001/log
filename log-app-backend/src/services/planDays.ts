/**
 * Which stored plan-day ids survive a plan update.
 *
 * Days are matched by position, so editing day 2 keeps day 2's id and the lift logs that
 * reference it stay attached. Recreating every day on each edit was nulling
 * `lift_logs.plan_day_id` (the FK defaults to SetNull), which is how history quietly lost
 * its session names.
 */
export function matchPlanDayIds(
  existingIds: string[],
  incomingCount: number,
): { keep: string[]; remove: string[] } {
  const keep = existingIds.slice(0, Math.max(0, incomingCount));
  return { keep, remove: existingIds.slice(keep.length) };
}
