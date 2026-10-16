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

/**
 * Idempotency id for a lift-draft attempt.
 *
 * The id stays stable while the payload is unchanged, so retrying after a lost
 * response replays the same row instead of logging the set twice. The moment
 * the values change, a fresh id is minted: replaying the old id with a
 * different payload is a 409 the server is right to refuse, and without a new
 * id the draft would be stuck in that error loop forever.
 *
 * `payloadKey` should be built from the parsed numbers (not the raw text), so
 * "60" and "60.0" count as the same attempt.
 */
export function requestIdForAttempt(
  current: { requestId: string; lastAttempt: string | null },
  payloadKey: string,
  mint: () => string,
): { requestId: string; lastAttempt: string } {
  const edited = current.lastAttempt != null && current.lastAttempt !== payloadKey;
  return {
    requestId: edited ? mint() : current.requestId,
    lastAttempt: payloadKey,
  };
}
