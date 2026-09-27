export const MAX_DAILY = {
  weight_kg: 999,
  calories: 99999,
  protein_g: 99999,
  sleep_hours: 24,
} as const;

export function parsePositiveNumber(raw: string, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0 || num > max) return null;
  return num;
}

export function parsePositiveInt(raw: string, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num <= 0 || num > max) return null;
  return num;
}
