import { Prisma } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../db/client";
import type { RevenueCatEvent } from "../validation/schemas";

export type RevenueCatEffect =
  | { action: "grant"; proUntil: Date | null }
  | { action: "keep_until"; proUntil: Date | null }
  | { action: "revoke" }
  | { action: "noop" };

function dateFromMs(value: number | null | undefined): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value) : null;
}

/**
 * Pure mapping from a RevenueCat lifecycle event to an entitlement change.
 * Unknown event types (invoices, experiments, virtual currency) are handled as
 * no-ops; the raw event is still stored for audit. `TRANSFER` is handled by the
 * caller because it spans two users.
 */
export function effectForRevenueCatEvent(
  event: RevenueCatEvent,
  entitlementId: string = config.revenueCat.entitlementId,
): RevenueCatEffect {
  if (event.type === "TEST" || event.type === "TRANSFER") return { action: "noop" };

  const ids =
    event.entitlement_ids ??
    (event.entitlement_id ? [event.entitlement_id] : null);
  if (ids != null && !ids.includes(entitlementId)) return { action: "noop" };

  const expiration = dateFromMs(event.expiration_at_ms);
  const grace = dateFromMs(event.grace_period_expiration_at_ms);

  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "NON_RENEWING_PURCHASE":
    case "SUBSCRIPTION_EXTENDED":
    case "REFUND_REVERSED":
      return { action: "grant", proUntil: expiration };
    case "CANCELLATION":
      // RevenueCat's refund sample arrives as CANCELLATION with a negative
      // price; that must revoke immediately, unlike a normal cancellation that
      // keeps access until the paid period ends.
      if (event.price != null && event.price < 0) return { action: "revoke" };
      return { action: "keep_until", proUntil: expiration };
    case "BILLING_ISSUE":
      return { action: "keep_until", proUntil: grace ?? expiration };
    case "EXPIRATION":
    case "SUBSCRIPTION_PAUSED":
    case "REFUND":
      return { action: "revoke" };
    default:
      return { action: "noop" };
  }
}

async function applyEffect(
  tx: Prisma.TransactionClient,
  userId: string,
  effect: RevenueCatEffect,
): Promise<void> {
  if (effect.action === "grant") {
    await tx.user.update({
      where: { id: userId },
      data: { planTier: "pro", proUntil: effect.proUntil },
    });
    return;
  }
  if (effect.action === "keep_until") {
    await tx.user.update({
      where: { id: userId },
      data: {
        planTier: "pro",
        // No expiry means "leave the existing pro_until alone" — never turn a
        // cancellation into an open-ended grant.
        ...(effect.proUntil ? { proUntil: effect.proUntil } : {}),
      },
    });
    return;
  }
  if (effect.action === "revoke") {
    await tx.user.update({
      where: { id: userId },
      data: { planTier: "free", proUntil: null },
    });
  }
}

/** Every app user id this event could map to (primary, original, aliases). */
function candidatesFor(event: RevenueCatEvent): string[] {
  return Array.from(
    new Set(
      [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

function expiresAt(event: RevenueCatEvent): Date | null {
  return dateFromMs(event.expiration_at_ms);
}

/**
 * Applies one webhook event and stores it in `billing_events`. The audit row,
 * entitlement change and processed marker share one transaction: a uniqueness
 * conflict means RevenueCat replayed an event we already applied (return
 * "duplicate"), while a failure rolls everything back so the next retry can
 * process it again.
 */
export async function processRevenueCatEvent(
  event: RevenueCatEvent,
): Promise<"processed" | "duplicate"> {
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.billingEvent.create({
        data: {
          revenueCatEventId: event.id,
          type: event.type,
          appUserId: event.app_user_id ?? null,
          environment: event.environment ?? null,
          payload: event as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      let linkedUserId: string | null = null;
      let needsReview = false;

      if (event.type === "TRANSFER") {
        const fromIds = Array.from(new Set(event.transferred_from ?? []));
        const toIds = Array.from(new Set(event.transferred_to ?? []));

        // Find the from user first so a subscription's remaining paid period can
        // be inherited when the transfer event itself has no expiry.
        let inheritedUntil: Date | null = null;
        for (const clerkId of fromIds) {
          const user = await tx.user.findFirst({
            where: { clerkUserId: clerkId },
            select: { id: true, proUntil: true },
          });
          if (!user) continue;
          if (!inheritedUntil && user.proUntil) inheritedUntil = user.proUntil;
          await tx.user.update({
            where: { id: user.id },
            data: { planTier: "free", proUntil: null },
          });
        }

        const proUntil = expiresAt(event) ?? inheritedUntil;
        for (const clerkId of toIds) {
          const user = await tx.user.findFirst({
            where: { clerkUserId: clerkId },
            select: { id: true },
          });
          if (!user) continue;
          linkedUserId = linkedUserId ?? user.id;
          if (proUntil) {
            await tx.user.update({
              where: { id: user.id },
              data: { planTier: "pro", proUntil },
            });
          } else {
            // No expiry on the event and no local source user to inherit from.
            // Do not invent open-ended access; flag for manual follow-up.
            needsReview = true;
          }
        }
        if (!linkedUserId) needsReview = true;
      } else {
        const candidates = candidatesFor(event);
        const effect = effectForRevenueCatEvent(event);
        const user =
          candidates.length > 0
            ? await tx.user.findFirst({
                where: { clerkUserId: { in: candidates } },
                select: { id: true, proUntil: true },
              })
            : null;
        if (user) {
          linkedUserId = user.id;
          if (effect.action !== "noop") {
            // A product change can leave an older EXPIRATION event in flight.
            // Never revoke when the account already has access that runs past
            // the expiring transaction.
            const eventExpiry = expiresAt(event);
            const newerAccess =
              user.proUntil != null &&
              eventExpiry != null &&
              user.proUntil.getTime() > eventExpiry.getTime();
            const isExpiryRevoke =
              effect.action === "revoke" &&
              (event.type === "EXPIRATION" || event.type === "SUBSCRIPTION_PAUSED");
            const shortensAccess =
              effect.action === "keep_until" &&
              effect.proUntil != null &&
              user.proUntil != null &&
              effect.proUntil.getTime() < user.proUntil.getTime();
            if (!(isExpiryRevoke && newerAccess) && !shortensAccess) {
              await applyEffect(tx, user.id, effect);
            }
          }
        } else if (event.type !== "TEST" && effect.action !== "noop") {
          // A real entitlement change arrived before we could find the account
          // (or the app user id is unknown). Keep it visible for reconciliation.
          needsReview = true;
        }
      }

      await tx.billingEvent.update({
        where: { id: row.id },
        data: {
          userId: linkedUserId,
          processedAt: needsReview ? null : new Date(),
        },
      });

      if (needsReview) {
        console.warn("[billing] RevenueCat event needs review", {
          eventId: event.id,
          type: event.type,
        });
      }
    });
    return "processed";
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return "duplicate";
    }
    throw err;
  }
}
