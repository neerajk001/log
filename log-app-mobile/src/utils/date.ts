/** Date helpers — all dates are YYYY-MM-DD strings (UTC), matching the API. */

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return toIso(new Date());
}

export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isoDaysAgo(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return toIso(d);
}

export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return toIso(d);
}

export function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];

export function weekdayShort(iso: string): string {
  return WEEKDAYS[parseIso(iso).getUTCDay()];
}

export function dayNumber(iso: string): number {
  return parseIso(iso).getUTCDate();
}

/** Label for a day card, e.g. "Fri, 19 Sep 2025". */
export function formatLongDate(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMediumDate(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface CalendarCell {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

/** Monday-first month grid (6 rows x 7 cols). */
export function monthMatrix(year: number, month: number): CalendarCell[] {
  const first = new Date(Date.UTC(year, month, 1));
  const startOffset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - startOffset);
  const today = todayLocal();

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = toIso(d);
    cells.push({
      iso,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month,
      isToday: iso === today,
    });
  }
  return cells;
}

export function weekDayLabels(): string[] {
  return WEEKDAYS_SHORT;
}

/** ISO week start (Monday) for a date string. */
export function startOfWeek(iso: string): string {
  const d = parseIso(iso);
  const diff = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return toIso(d);
}

/** The 7 ISO dates of the current week, Monday first. */
export function currentWeekDays(from: string = todayLocal()): string[] {
  const start = startOfWeek(from);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
