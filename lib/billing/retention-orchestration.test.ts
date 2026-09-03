import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import {
  BillingRetentionError,
  acceptRetentionOfferWithDeps,
  cancelSubscriptionWithDeps,
  resumeSubscriptionWithDeps,
  hasAnyDiscount,
  hasCoupon,
  type RetentionClaim,
  type RetentionDeps,
  type RetentionSubscriptionRow,
} from "./retention-orchestrator";

const USER_ID = "user_123";
const COUPON = "2SfA4hHs";
const PERIOD_END = "2026-10-01T00:00:00.000Z";

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    livemode: false,
    customer: "cus_123",
    metadata: { user_id: USER_ID, plan_code: "core", billing_cadence: "monthly" },
    schedule: null,
    status: "active",
    cancel_at: null,
    cancel_at_period_end: false,
    discounts: [],
    items: { data: [{ id: "si_123", price: { id: "price_core" }, quantity: 1 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function discount(couponId: string, id = "di_123") {
  return { id, object: "discount", source: { type: "coupon", coupon: { id: couponId } } };
}

const ACTIVE_ROW: RetentionSubscriptionRow = {
  stripe_subscription_id: "sub_123",
  stripe_customer_id: "cus_123",
  status: "active",
  current_period_end: PERIOD_END,
  cancel_at: null,
  cancel_at_period_end: false,
  pending_plan_code: null,
  stripe_schedule_id: null,
};

type Calls = {
  updates: { id: string; params: Stripe.SubscriptionUpdateParams; key: string | null }[];
  claims: ("show" | "accept")[];
  releases: number;
};

function deps(overrides: Partial<RetentionDeps> = {}): RetentionDeps & { calls: Calls } {
  const calls: Calls = { updates: [], claims: [], releases: 0 };
  return {
    calls,
    livemode: false,
    couponId: COUPON,
    percentOff: 40,
    activeSubscription: async () => ACTIVE_ROW,
    claimOffer: async (_userId, action) => {
      calls.claims.push(action);
      return { decision: "granted", shownAt: null, acceptedAt: null } satisfies RetentionClaim;
    },
    releaseAcceptance: async () => {
      calls.releases += 1;
    },
    retrieveSubscription: async () => subscription(),
    cadenceForSubscription: () => "monthly",
    releaseSchedule: async (value) => value,
    clearPending: async () => undefined,
    updateSubscription: async (id, params, key) => {
      calls.updates.push({ id, params, key });
      return subscription({ id, ...params });
    },
    syncSubscription: async () => undefined,
    ...overrides,
  };
}

/* ------------------------ Coupon configuration ------------------------ */

// Stripe scopes coupons to a billing mode, so an environment without one of its
// own must not promise a discount it cannot apply.
test("with no coupon configured the offer is never made, and the claim is kept", async () => {
  const d = deps({ couponId: null });
  const result = await cancelSubscriptionWithDeps(d, USER_ID);

  assert.equal(result.status, "scheduled");
  assert.deepEqual(d.calls.claims, []);
  assert.equal(d.calls.updates.length, 1);
  assert.equal(d.calls.updates[0].params.cancel_at_period_end, true);
});

test("with no coupon configured accepting is refused before any claim or Stripe write", async () => {
  const d = deps({ couponId: null });
  await assert.rejects(
    () => acceptRetentionOfferWithDeps(d, USER_ID),
    (error: unknown) => error instanceof BillingRetentionError && error.code === "not-offered",
  );

  assert.deepEqual(d.calls.claims, []);
  assert.equal(d.calls.updates.length, 0);
  assert.equal(d.calls.releases, 0);
});

/* ---------------------------- Cancellation ---------------------------- */

test("the first confirmed cancellation returns the save offer instead of cancelling", async () => {
  const d = deps();
  const result = await cancelSubscriptionWithDeps(d, USER_ID);

  assert.equal(result.status, "offer");
  assert.deepEqual(d.calls.claims, ["show"]);
  assert.equal(d.calls.updates.length, 0, "nothing may be cancelled while the offer is on screen");
});

test("cancelling again once the offer has been shown schedules it for the period end", async () => {
  const d = deps({
    claimOffer: async () => ({ decision: "already_shown", shownAt: "2026-09-01T00:00:00.000Z", acceptedAt: null }),
  });
  const result = await cancelSubscriptionWithDeps(d, USER_ID);

  assert.equal(result.status, "scheduled");
  assert.equal(d.calls.updates[0].params.cancel_at_period_end, true);
  assert.equal(d.calls.updates.length, 1);
});

test("a student who already spent the offer is cancelled without seeing it again", async () => {
  for (const decision of ["already_shown", "already_accepted"] as const) {
    const d = deps({ claimOffer: async () => ({ decision, shownAt: "x", acceptedAt: "y" }) });
    const result = await cancelSubscriptionWithDeps(d, USER_ID);
    assert.equal(result.status, "scheduled");
  }
});

test("cancelling releases a scheduled downgrade so it cannot restart billing", async () => {
  let released = 0;
  let cleared = 0;
  const d = deps({
    activeSubscription: async () => ({ ...ACTIVE_ROW, pending_plan_code: "core", stripe_schedule_id: "sub_sched_1" }),
    claimOffer: async () => ({ decision: "already_shown", shownAt: "x", acceptedAt: null }),
    retrieveSubscription: async () => subscription({ schedule: "sub_sched_1" }),
    releaseSchedule: async (value) => {
      released += 1;
      return subscription({ id: value.id });
    },
    clearPending: async () => {
      cleared += 1;
    },
  });

  await cancelSubscriptionWithDeps(d, USER_ID);
  assert.equal(released, 1);
  assert.equal(cleared, 1);
});

test("an already-cancelled subscription neither burns the offer nor calls Stripe again", async () => {
  const d = deps({
    activeSubscription: async () => ({ ...ACTIVE_ROW, cancel_at_period_end: true }),
  });
  const result = await cancelSubscriptionWithDeps(d, USER_ID);

  assert.equal(result.status, "already-scheduled");
  assert.deepEqual(d.calls.claims, []);
  assert.equal(d.calls.updates.length, 0);
});

test("cancelling without an active subscription fails before any claim", async () => {
  const d = deps({ activeSubscription: async () => null });
  await assert.rejects(
    cancelSubscriptionWithDeps(d, USER_ID),
    (error: unknown) => error instanceof BillingRetentionError && error.code === "subscription",
  );
  assert.deepEqual(d.calls.claims, []);
});

/* ------------------------------- The offer ------------------------------ */

test("accepting applies the coupon without charging, cancelling, or moving the renewal", async () => {
  const d = deps();
  const result = await acceptRetentionOfferWithDeps(d, USER_ID);

  assert.equal(result.status, "accepted");
  assert.equal(result.percentOff, 40);
  assert.equal(result.renewsAt, PERIOD_END);

  // Nothing to undo on the normal path, so the coupon is the only write.
  assert.equal(d.calls.updates.length, 1);
  const [update] = d.calls.updates;
  assert.deepEqual(update.params.discounts, [{ coupon: COUPON }]);
  assert.equal(update.params.proration_behavior, "none", "nothing may be invoiced today");
  assert.equal(update.params.items, undefined, "no new subscription or price change");
});

test("accepting undoes a scheduled cancellation in its own write", async () => {
  for (const [scheduled, expected] of [
    [{ cancel_at_period_end: true }, { cancel_at_period_end: false, proration_behavior: "none" }],
    [{ cancel_at: 1_800_000_000 }, { cancel_at: "", proration_behavior: "none" }],
  ] as const) {
    const d = deps({ retrieveSubscription: async () => subscription(scheduled) });
    await acceptRetentionOfferWithDeps(d, USER_ID);

    assert.equal(d.calls.updates.length, 2, "the undo is separate from the coupon write");
    assert.deepEqual(d.calls.updates[0].params, expected);
    assert.equal(d.calls.updates[0].key, null, "a state toggle must not be replayable");
    assert.deepEqual(d.calls.updates[1].params.discounts, [{ coupon: COUPON }]);
  }
});

test("an already-discounted subscription is refused, and never spends the claim", async () => {
  const d = deps({
    retrieveSubscription: async () => subscription({ discounts: [discount("other_coupon", "di_existing")] }),
  });

  await assert.rejects(
    acceptRetentionOfferWithDeps(d, USER_ID),
    (error: unknown) => error instanceof BillingRetentionError && error.code === "discounted",
  );
  assert.deepEqual(d.calls.claims, [], "an ineligible account must not burn its claim by asking");
  assert.equal(d.calls.updates.length, 0);
});

test("an unexpanded discount id still counts as discounted, so nothing stacks", async () => {
  const d = deps({ retrieveSubscription: async () => subscription({ discounts: ["di_unexpanded"] }) });

  await assert.rejects(
    acceptRetentionOfferWithDeps(d, USER_ID),
    (error: unknown) => error instanceof BillingRetentionError && error.code === "discounted",
  );
  assert.equal(d.calls.updates.length, 0);
});

test("a discounted student is never shown the offer, and keeps it for later", async () => {
  const d = deps({
    retrieveSubscription: async () => subscription({ discounts: [discount("other_coupon")] }),
  });

  const result = await cancelSubscriptionWithDeps(d, USER_ID);
  assert.equal(result.status, "scheduled", "cancelling proceeds straight through");
  assert.deepEqual(d.calls.claims, [], "the offer is not burned by a cancellation they never saw it on");
  assert.equal(d.calls.updates[0].params.cancel_at_period_end, true);
});

test("the applied coupon stands alone on the subscription", async () => {
  const d = deps();
  await acceptRetentionOfferWithDeps(d, USER_ID);

  assert.deepEqual(d.calls.updates[0].params.discounts, [{ coupon: COUPON }]);
});

test("the offer can only ever be claimed once, across resubscribes and devices", async () => {
  const d = deps({
    claimOffer: async () => ({ decision: "already_accepted", shownAt: "x", acceptedAt: "y" }),
  });

  await assert.rejects(
    acceptRetentionOfferWithDeps(d, USER_ID),
    (error: unknown) => error instanceof BillingRetentionError && error.code === "spent",
  );
  assert.equal(d.calls.updates.length, 0);
});

test("a duplicate request whose twin already applied the coupon reports it, and never reapplies", async () => {
  const d = deps({
    claimOffer: async () => ({ decision: "already_accepted", shownAt: "x", acceptedAt: "y" }),
    retrieveSubscription: async () => subscription({ discounts: [discount(COUPON)] }),
  });

  const result = await acceptRetentionOfferWithDeps(d, USER_ID);
  assert.equal(result.status, "already-applied");
  assert.equal(d.calls.updates.length, 0, "the coupon must never be applied twice");
});

test("the winning request also stops short when the coupon is already on the subscription", async () => {
  const d = deps({ retrieveSubscription: async () => subscription({ discounts: [discount(COUPON)] }) });

  const result = await acceptRetentionOfferWithDeps(d, USER_ID);
  assert.equal(result.status, "already-applied");
  assert.equal(d.calls.updates.length, 0);
});

test("accepting an offer that was never made is refused", async () => {
  const d = deps({ claimOffer: async () => ({ decision: "not_offered", shownAt: null, acceptedAt: null }) });

  await assert.rejects(
    acceptRetentionOfferWithDeps(d, USER_ID),
    (error: unknown) => error instanceof BillingRetentionError && error.code === "not-offered",
  );
  assert.equal(d.calls.updates.length, 0);
});

test("a failed Stripe call gives the offer back instead of burning it", async () => {
  const d = deps({
    updateSubscription: async () => {
      throw new Error("stripe unavailable");
    },
  });

  await assert.rejects(acceptRetentionOfferWithDeps(d, USER_ID), /stripe unavailable/);
  assert.equal(d.calls.releases, 1);
});

test("the acceptance idempotency key is stable for a user and subscription", async () => {
  const first = deps();
  const second = deps();
  await acceptRetentionOfferWithDeps(first, USER_ID);
  await acceptRetentionOfferWithDeps(second, USER_ID);

  const key = first.calls.updates[0].key;
  assert.equal(key, second.calls.updates[0].key);
  assert.match(key ?? "", /sub_123/);
});

test("cancelling carries no idempotency key, so a cancel after a resume still lands", async () => {
  const d = deps({ claimOffer: async () => ({ decision: "already_shown", shownAt: "x", acceptedAt: null }) });
  await cancelSubscriptionWithDeps(d, USER_ID);

  assert.equal(d.calls.updates[0].key, null);
});

// The bug that broke resuming and accepting in production: Stripe rejects an
// update carrying both fields, and only the plain cancel path sent just one.
test("no update ever sends both cancel_at and cancel_at_period_end", async () => {
  const scenarios: Array<() => Promise<unknown>> = [];
  const recorded: Calls[] = [];

  for (const scheduled of [{}, { cancel_at_period_end: true }, { cancel_at: 1_800_000_000 }]) {
    const accept = deps({ retrieveSubscription: async () => subscription(scheduled) });
    recorded.push(accept.calls);
    scenarios.push(() => acceptRetentionOfferWithDeps(accept, USER_ID));

    const resume = deps({
      activeSubscription: async () => ({ ...ACTIVE_ROW, cancel_at_period_end: true }),
      retrieveSubscription: async () => subscription(scheduled),
    });
    recorded.push(resume.calls);
    scenarios.push(() => resumeSubscriptionWithDeps(resume, USER_ID));
  }

  const cancel = deps({ claimOffer: async () => ({ decision: "already_shown", shownAt: "x", acceptedAt: null }) });
  recorded.push(cancel.calls);
  scenarios.push(() => cancelSubscriptionWithDeps(cancel, USER_ID));

  for (const run of scenarios) await run();

  for (const calls of recorded) {
    for (const update of calls.updates) {
      const both = "cancel_at" in update.params && "cancel_at_period_end" in update.params;
      assert.equal(both, false, `Stripe rejects both fields together: ${JSON.stringify(update.params)}`);
    }
  }
});

/* ------------------------------- Identity ------------------------------- */

test("both paths refuse a Stripe subscription that is not this account's", async () => {
  const wrong = [
    subscription({ livemode: true }),
    subscription({ customer: "cus_attacker" }),
    subscription({ id: "sub_other" }),
    subscription({ metadata: { user_id: "user_attacker" } }),
  ];

  for (const value of wrong) {
    const cancelDeps = deps({
      claimOffer: async () => ({ decision: "already_shown", shownAt: "x", acceptedAt: null }),
      retrieveSubscription: async () => value,
    });
    await assert.rejects(cancelSubscriptionWithDeps(cancelDeps, USER_ID), /Stripe/);
    assert.equal(cancelDeps.calls.updates.length, 0);

    const acceptDeps = deps({ retrieveSubscription: async () => value });
    await assert.rejects(acceptRetentionOfferWithDeps(acceptDeps, USER_ID), /Stripe/);
    assert.equal(acceptDeps.calls.updates.length, 0);
  }
});

test("hasAnyDiscount counts every discount, expanded or not", () => {
  assert.equal(hasAnyDiscount(subscription()), false);
  assert.equal(hasAnyDiscount(subscription({ discounts: [discount("any")] })), true);
  assert.equal(hasAnyDiscount(subscription({ discounts: ["di_unexpanded"] })), true);
});

test("hasCoupon reads expanded discounts and ignores unexpanded ids", () => {
  assert.equal(hasCoupon(subscription({ discounts: [discount(COUPON)] }), COUPON), true);
  assert.equal(hasCoupon(subscription({ discounts: [discount("other")] }), COUPON), false);
  assert.equal(hasCoupon(subscription({ discounts: ["di_unexpanded"] }), COUPON), false);
  assert.equal(hasCoupon(subscription(), COUPON), false);
});

/* -------------------------------- Resume -------------------------------- */

test("resuming clears a scheduled cancellation without touching price or billing date", async () => {
  const d = deps({
    activeSubscription: async () => ({ ...ACTIVE_ROW, cancel_at_period_end: true }),
    retrieveSubscription: async () => subscription({ cancel_at_period_end: true }),
  });
  const result = await resumeSubscriptionWithDeps(d, USER_ID);

  assert.equal(result.status, "resumed");
  assert.equal(result.renewsAt, PERIOD_END);
  const [update] = d.calls.updates;
  assert.deepEqual(update.params, { cancel_at_period_end: false, proration_behavior: "none" });
  assert.equal(update.params.discounts, undefined, "resuming must not touch a discount");
});

test("resuming clears a cancel_at timestamp with the matching field", async () => {
  const d = deps({
    activeSubscription: async () => ({ ...ACTIVE_ROW, cancel_at: "2026-10-01T00:00:00.000Z" }),
    retrieveSubscription: async () => subscription({ cancel_at: 1_800_000_000 }),
  });

  await resumeSubscriptionWithDeps(d, USER_ID);
  assert.deepEqual(d.calls.updates[0].params, { cancel_at: "", proration_behavior: "none" });
});

test("a row that says cancelling but a Stripe object that does not is reported, not rewritten", async () => {
  const d = deps({ activeSubscription: async () => ({ ...ACTIVE_ROW, cancel_at_period_end: true }) });

  const result = await resumeSubscriptionWithDeps(d, USER_ID);
  assert.equal(result.status, "not-scheduled");
  assert.equal(d.calls.updates.length, 0);
});

test("resuming releases a schedule before undoing the cancellation", async () => {
  let released = 0;
  const d = deps({
    activeSubscription: async () => ({ ...ACTIVE_ROW, cancel_at_period_end: true }),
    retrieveSubscription: async () => subscription({ schedule: "sub_sched_1", cancel_at_period_end: true }),
    releaseSchedule: async (value) => {
      released += 1;
      return subscription({ id: value.id, cancel_at_period_end: true });
    },
  });

  await resumeSubscriptionWithDeps(d, USER_ID);
  assert.equal(released, 1);
  assert.equal(d.calls.updates.length, 1);
});

test("resuming a subscription that is not cancelling is a no-op", async () => {
  const d = deps();
  const result = await resumeSubscriptionWithDeps(d, USER_ID);

  assert.equal(result.status, "not-scheduled");
  assert.equal(d.calls.updates.length, 0);
});

test("resuming never spends or restores the save offer", async () => {
  const d = deps({ activeSubscription: async () => ({ ...ACTIVE_ROW, cancel_at: "2026-10-01T00:00:00.000Z" }) });
  await resumeSubscriptionWithDeps(d, USER_ID);

  assert.deepEqual(d.calls.claims, []);
  assert.equal(d.calls.releases, 0);
});
