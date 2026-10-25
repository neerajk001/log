import { describe, expect, it } from "vitest";
import { effectForRevenueCatEvent } from "../src/services/revenueCat";
import type { RevenueCatEvent } from "../src/validation/schemas";

const EXPIRES = Date.parse("2026-11-25T10:00:00Z");

function event(patch: Partial<RevenueCatEvent> & { type: string }): RevenueCatEvent {
  return {
    id: "evt-1",
    app_user_id: "user_clerk",
    entitlement_ids: ["pro"],
    expiration_at_ms: EXPIRES,
    ...patch,
  } as RevenueCatEvent;
}

describe("effectForRevenueCatEvent", () => {
  it("grants Pro on an initial purchase until the paid period ends", () => {
    expect(effectForRevenueCatEvent(event({ type: "INITIAL_PURCHASE" }))).toEqual({
      action: "grant",
      proUntil: new Date(EXPIRES),
    });
  });

  it("grants Pro on renewal, uncancellation and product change", () => {
    for (const type of ["RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]) {
      expect(effectForRevenueCatEvent(event({ type }))).toEqual({
        action: "grant",
        proUntil: new Date(EXPIRES),
      });
    }
  });

  it("keeps access until expiry on a normal cancellation", () => {
    expect(
      effectForRevenueCatEvent(event({ type: "CANCELLATION", price: 0 })),
    ).toEqual({ action: "keep_until", proUntil: new Date(EXPIRES) });
  });

  it("revokes immediately on a refund-style cancellation", () => {
    expect(
      effectForRevenueCatEvent(
        event({ type: "CANCELLATION", price: -9.99, cancel_reason: "CUSTOMER_SUPPORT" }),
      ),
    ).toEqual({ action: "revoke" });
  });

  it("revokes on expiration and pause", () => {
    expect(effectForRevenueCatEvent(event({ type: "EXPIRATION" }))).toEqual({
      action: "revoke",
    });
    expect(effectForRevenueCatEvent(event({ type: "SUBSCRIPTION_PAUSED" }))).toEqual({
      action: "revoke",
    });
  });

  it("keeps access through a billing grace period", () => {
    const grace = Date.parse("2026-12-02T10:00:00Z");
    expect(
      effectForRevenueCatEvent(
        event({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: grace }),
      ),
    ).toEqual({ action: "keep_until", proUntil: new Date(grace) });
  });

  it("ignores events for another entitlement", () => {
    expect(
      effectForRevenueCatEvent(event({ type: "INITIAL_PURCHASE", entitlement_ids: ["other"] })),
    ).toEqual({ action: "noop" });
  });

  it("supports the singular entitlement_id field", () => {
    expect(
      effectForRevenueCatEvent(
        event({ type: "INITIAL_PURCHASE", entitlement_ids: null, entitlement_id: "pro" }),
      ),
    ).toEqual({ action: "grant", proUntil: new Date(EXPIRES) });
  });

  it("treats a lifetime purchase as open-ended", () => {
    expect(
      effectForRevenueCatEvent(
        event({ type: "NON_RENEWING_PURCHASE", expiration_at_ms: null }),
      ),
    ).toEqual({ action: "grant", proUntil: null });
  });

  it("does not touch the account for TEST, TRANSFER or unknown events", () => {
    for (const type of ["TEST", "TRANSFER", "INVOICE_ISSUANCE", "EXPERIMENT_ENROLLMENT"]) {
      expect(effectForRevenueCatEvent(event({ type }))).toEqual({ action: "noop" });
    }
  });
});
