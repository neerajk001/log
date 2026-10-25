import { useCallback } from "react";
import { useMe } from "./useMe";
import { useBilling } from "./useBilling";
import type { ProFeature } from "../api/types";

/**
 * Client-side gates. The AI ones mirror the server's `Feature`s; the analytics
 * ones are range/feature gates the server enforces by clamping.
 */
export type Gate = ProFeature | "insights_full" | "lift_progress_full";

/**
 * Single source of truth for "is this behind Pro?".
 *
 * `/me` already carries the entitlement (so it is right on first paint); the
 * billing endpoint adds this period's usage for the AI hints.
 */
export function useEntitlement() {
  const { profile } = useMe();
  const { status, refetch } = useBilling();

  const isPro = status?.is_pro ?? profile?.is_pro ?? false;
  const isTrial = status?.is_trial ?? profile?.is_trial ?? false;
  const trialDaysLeft = status?.trial_days_left ?? profile?.trial_days_left ?? null;

  const usageFor = useCallback(
    (feature: ProFeature) => status?.features.find((f) => f.feature === feature),
    [status],
  );

  const isLocked = useCallback(
    (gate: Gate) => {
      if (isPro) return false;
      // Analytics ranges are Pro-only outright.
      if (gate === "insights_full" || gate === "lift_progress_full") return true;
      const usage = status?.features.find((f) => f.feature === gate);
      // Usage unknown (still loading or the request failed): don't show a paywall
      // the athlete may not need. The server still enforces the quota and returns
      // 402, which the caller turns into the same upgrade card.
      if (!usage) return false;
      return !usage.allowed;
    },
    [isPro, status],
  );

  /** Units left this period, or null when unlimited/unknown. */
  const remaining = useCallback(
    (feature: ProFeature): number | null => {
      if (isPro) return null;
      const usage = status?.features.find((f) => f.feature === feature);
      if (!usage || usage.limit === null) return null;
      return Math.max(0, usage.limit - usage.used);
    },
    [isPro, status],
  );

  return { isPro, isTrial, trialDaysLeft, isLocked, remaining, usageFor, status, refetch };
}
