import { AppError } from "../middleware/errorHandler";

export const MAX_RANGE_DAYS = 3650;
export const RANGE_TOO_LARGE = "RANGE_TOO_LARGE";

/** ISO date (YYYY-MM-DD) shifted by whole days, in UTC. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive day count between two ISO dates (`to - from + 1`). */
export function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

export function assertRangeSize(from: string, to: string): void {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return;
  if (start > end) {
    throw new AppError(400, "INVALID_RANGE", "from must be on or before to");
  }
  if ((end - start) / 86400000 > MAX_RANGE_DAYS) {
    throw new AppError(
      400,
      RANGE_TOO_LARGE,
      `Date range must be ${MAX_RANGE_DAYS} days or fewer`,
    );
  }
}
