import { config } from "../config";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";

/** Every surface that costs a model call gets an allowance. */
export type Feature =
  | "chat"
  | "meal_scan"
  | "eating_out"
  | "plan_generate"
  | "plan_parse"
  | "physique";

export const FEATURES: readonly Feature[] = [
  "chat",
  "meal_scan",
  "eating_out",
  "plan_generate",
  "plan_parse",
  "physique",
];

/** Weekly buckets; everything else resets on the 1st of the month. */
const WEEKLY: ReadonlySet<Feature> = new Set<Feature>(["chat"]);

const DAY_MS = 86_400_000;

export interface EntitlementUser {
  planTier: "free" | "pro";
  trialEndsAt: Date | null;
  proUntil: Date | null;
}

export interface FeatureUsage {
  feature: Feature;
  used: number;
  /** `null` = unlimited (Pro or an active trial). */
  limit: number | null;
  /** ISO date the allowance next resets. */
  resets_on: string;
  allowed: boolean;
}

/** A paid window (from the store sync) that has not lapsed. */
function hasActiveSubscription(user: EntitlementUser, now: Date): boolean {
  return user.planTier === "pro" && (user.proUntil === null || user.proUntil > now);
}

/** The 14-day trial has not lapsed. */
export function isTrialActive(user: EntitlementUser, now: Date = new Date()): boolean {
  return user.trialEndsAt !== null && user.trialEndsAt > now;
}

/** Pro features are available on a subscription or during the trial. */
export function isPro(user: EntitlementUser, now: Date = new Date()): boolean {
  return hasActiveSubscription(user, now) || isTrialActive(user, now);
}

/** True only while the athlete is on the trial rather than paying. */
export function isOnTrial(user: EntitlementUser, now: Date = new Date()): boolean {
  return isTrialActive(user, now) && !hasActiveSubscription(user, now);
}

/** Whole days left in the trial, floored at 0. Null when there is no trial. */
export function trialDaysLeft(user: EntitlementUser, now: Date = new Date()): number | null {
  if (!user.trialEndsAt) return null;
  return Math.max(0, Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / DAY_MS));
}

/**
 * Start of the current quota window: the ISO Monday for weekly features, the
 * 1st of the UTC month for the rest. UTC throughout — the stored column is a
 * DATE, so a server-timezone boundary would shift buckets arbitrarily.
 */
export function periodStart(feature: Feature, now: Date = new Date()): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  if (WEEKLY.has(feature)) {
    const sinceMonday = (now.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(year, month, day - sinceMonday));
  }
  return new Date(Date.UTC(year, month, 1));
}

/** The next reset boundary after `start`. */
export function periodEnd(feature: Feature, start: Date): Date {
  if (WEEKLY.has(feature)) return new Date(start.getTime() + 7 * DAY_MS);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

/** Allowance for a Free athlete; Pro/trial callers are unlimited. */
export function limitFor(feature: Feature, pro: boolean): number | null {
  return pro ? null : config.billing.freeLimits[feature];
}

function upgradeMessage(feature: Feature): string {
  switch (feature) {
    case "chat":
      return "You've used this week's free coach messages. Pro keeps the coach available whenever you need it.";
    case "meal_scan":
      return "You've used this month's free meal scans. Pro lets you scan as many meals as you like.";
    case "eating_out":
      return "You've used this month's free eating-out checks. Pro keeps them available whenever you eat out.";
    case "plan_generate":
      return "You've used this month's free AI plan. Pro builds as many plans as you need.";
    case "plan_parse":
      return "You've used this month's free plan imports. Pro imports as many plans as you like.";
    case "physique":
      return "Photo check-ins are part of Pro. Upgrade to compare how your physique changes.";
  }
}

/**
 * Counts one use of `feature` for a Free athlete and throws 402 when the
 * allowance is spent. Callers must check `isPro` first — Pro users never
 * consume quota (and never write a row).
 */
export async function consumeQuota(
  userId: string,
  feature: Feature,
  now: Date = new Date(),
): Promise<FeatureUsage> {
  const limit = limitFor(feature, false) ?? 0;
  const start = periodStart(feature, now);
  const key = { userId, feature, periodStart: start };

  const existing = await prisma.aiUsage.findUnique({
    where: { userId_feature_periodStart: key },
    select: { count: true },
  });

  if ((existing?.count ?? 0) >= limit) {
    throw new AppError(402, "UPGRADE_REQUIRED", upgradeMessage(feature));
  }

  const row = await prisma.aiUsage.upsert({
    where: { userId_feature_periodStart: key },
    create: { ...key, count: 1 },
    update: { count: { increment: 1 } },
  });

  return {
    feature,
    used: row.count,
    limit,
    resets_on: periodEnd(feature, start).toISOString().slice(0, 10),
    allowed: row.count < limit,
  };
}

/** Usage for every feature, for the paywall and in-app "N left" hints. */
export async function getUsage(
  userId: string,
  user: EntitlementUser,
  now: Date = new Date(),
): Promise<FeatureUsage[]> {
  const pro = isPro(user, now);
  const windows = FEATURES.map((feature) => ({ feature, periodStart: periodStart(feature, now) }));

  const rows = await prisma.aiUsage.findMany({
    where: { userId, OR: windows },
    select: { feature: true, periodStart: true, count: true },
  });

  return FEATURES.map((feature) => {
    const start = periodStart(feature, now);
    const limit = limitFor(feature, pro);
    const row = rows.find(
      (r) => r.feature === feature && r.periodStart.getTime() === start.getTime(),
    );
    const used = row?.count ?? 0;

    return {
      feature,
      used,
      limit,
      resets_on: periodEnd(feature, start).toISOString().slice(0, 10),
      allowed: limit === null || used < limit,
    };
  });
}
