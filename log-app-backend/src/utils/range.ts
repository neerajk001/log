import { AppError } from "../middleware/errorHandler";

export const MAX_RANGE_DAYS = 3650;
export const RANGE_TOO_LARGE = "RANGE_TOO_LARGE";

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
