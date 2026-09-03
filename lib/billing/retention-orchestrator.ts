// The one-time cancellation save offer, and the in-app cancellation it guards.
//
// Both halves are eligibility-gated in the database, never by the caller: the
// browser says only "I want to cancel" or "I'll take the offer", and the server
// decides from claim_retention_offer whether an offer is still owed. That is why
// hammering either endpoint cannot produce a second discount — the first claim
// takes the row, every later one is told the offer is spent.
//
// Showing the offer is what burns it. A student who declines has still seen it,
// so declining and accepting cost exactly the same entitlement.

import type Stripe from "stripe";
import type { BillingCadence } from "./offers";
import { scheduledCancellationAt } from "./policy";

export type RetentionSubscriptionRow = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at: string | null;
  cancel_at_period_end: boolean;
  pending_plan_code: string | null;
  stripe_schedule_id: string | null;
};

export type RetentionClaim = {
  decision: "granted" | "already_shown" | "already_accepted" | "not_offered";
  shownAt: string | null;
  acceptedAt: string | null;
};

export type RetentionOffer = {
  percentOff: number;
  cadence: BillingCadence;
  renewsAt: string | null;
};

export type CancellationResult =
  | { status: "offer"; offer: RetentionOffer }
  | { status: "scheduled"; accessEndsAt: string | null }
  | { status: "already-scheduled"; accessEndsAt: string | null };

export type RetentionAcceptResult = {
  status: "accepted" | "already-applied";
  percentOff: number;
  renewsAt: string | null;
};

export class BillingRetentionError extends Error {
  constructor(
    public readonly code: "account" | "subscription" | "not-offered" | "spent" | "in-flight",
    message: string,
  ) {
    super(message);
    this.name = "BillingRetentionError";
  }
}

export type RetentionDeps = {
  livemode: boolean;
  couponId: string;
  percentOff: number;
  activeSubscription: (userId: string, livemode: boolean) => Promise<RetentionSubscriptionRow | null>;
  claimOffer: (userId: string, action: "show" | "accept") => Promise<RetentionClaim>;
  releaseAcceptance: (userId: string) => Promise<void>;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
  cadenceForSubscription: (subscription: Stripe.Subscription) => BillingCadence;
  releaseSchedule: (subscription: Stripe.Subscription) => Promise<Stripe.Subscription>;
  clearPending: (subscriptionId: string) => Promise<void>;
  updateSubscription: (
    id: string,
    params: Stripe.SubscriptionUpdateParams,
    idempotencyKey: string,
  ) => Promise<Stripe.Subscription>;
  syncSubscription: (subscription: Stripe.Subscription, userId: string) => Promise<void>;
};

// Confirming a cancellation. The first confirmation from a student who has never
// seen the offer returns it instead of cancelling; the next one goes through,
// which is how "Continue Cancellation" needs no trusted flag from the browser.
export async function cancelSubscriptionWithDeps(
  deps: RetentionDeps,
  userId: string,
): Promise<CancellationResult> {
  const row = await requireActiveSubscription(deps, userId);

  const alreadyScheduled = scheduledCancellationAt({
    cancelAt: row.cancel_at,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    currentPeriodEnd: row.current_period_end,
  });
  if (alreadyScheduled) {
    return { status: "already-scheduled", accessEndsAt: alreadyScheduled };
  }

  const claim = await deps.claimOffer(userId, "show");
  if (claim.decision === "granted") {
    const subscription = await retrieveOwnedSubscription(deps, row, userId);
    return {
      status: "offer",
      offer: {
        percentOff: deps.percentOff,
        cadence: deps.cadenceForSubscription(subscription),
        renewsAt: row.current_period_end,
      },
    };
  }

  let subscription = await retrieveOwnedSubscription(deps, row, userId);
  // A scheduled downgrade would otherwise outlive the cancellation and quietly
  // restart billing on the cheaper plan, so it goes first. Same order the plan
  // change path uses before it mutates a subscription.
  if (row.stripe_schedule_id || row.pending_plan_code || subscription.schedule) {
    subscription = await deps.releaseSchedule(subscription);
    assertSubscriptionOwner(subscription, row, userId, deps.livemode);
    await deps.clearPending(subscription.id);
  }

  const canceled = await deps.updateSubscription(
    subscription.id,
    { cancel_at_period_end: true, proration_behavior: "none" },
    `blueprint-cancel-${subscription.id}`,
  );
  assertSubscriptionOwner(canceled, row, userId, deps.livemode);
  await deps.syncSubscription(canceled, userId);

  return {
    status: "scheduled",
    accessEndsAt: typeof canceled.cancel_at === "number"
      ? new Date(canceled.cancel_at * 1000).toISOString()
      : row.current_period_end,
  };
}

// Taking the save offer. The claim is taken before the Stripe call and released
// if that call fails, so a student never loses the offer to a network error.
export async function acceptRetentionOfferWithDeps(
  deps: RetentionDeps,
  userId: string,
): Promise<RetentionAcceptResult> {
  const row = await requireActiveSubscription(deps, userId);
  const claim = await deps.claimOffer(userId, "accept");

  if (claim.decision === "not_offered") {
    throw new BillingRetentionError("not-offered", "This offer has not been made to this account");
  }

  if (claim.decision !== "granted") {
    // Someone already holds the claim. Whether that is a double-click still in
    // flight or a spend from an earlier subscription, only the coupon actually
    // sitting on this subscription proves it landed.
    const existing = await retrieveOwnedSubscription(deps, row, userId);
    if (hasCoupon(existing, deps.couponId)) {
      return {
        status: "already-applied",
        percentOff: deps.percentOff,
        renewsAt: row.current_period_end,
      };
    }
    throw new BillingRetentionError("spent", "This save offer has already been used");
  }

  try {
    let subscription = await retrieveOwnedSubscription(deps, row, userId);
    if (hasCoupon(subscription, deps.couponId)) {
      return {
        status: "already-applied",
        percentOff: deps.percentOff,
        renewsAt: row.current_period_end,
      };
    }

    // Existing discounts are carried over rather than replaced: `discounts` is a
    // whole-list write, so sending only the retention coupon would silently strip
    // a deal the student already had.
    const discounts: Stripe.SubscriptionUpdateParams.Discount[] = [
      ...existingDiscountIds(subscription).map((discount) => ({ discount })),
      { coupon: deps.couponId },
    ];

    // proration_behavior "none" and no item change mean Stripe writes the
    // discount without invoicing: nothing is charged now and the renewal date
    // does not move. The coupon's own `once` duration limits it to that renewal.
    const updated = await deps.updateSubscription(
      subscription.id,
      {
        discounts,
        cancel_at_period_end: false,
        cancel_at: "",
        proration_behavior: "none",
      },
      `blueprint-retention-${userId}-${subscription.id}`,
    );
    assertSubscriptionOwner(updated, row, userId, deps.livemode);
    subscription = updated;
    await deps.syncSubscription(subscription, userId);

    return {
      status: "accepted",
      percentOff: deps.percentOff,
      renewsAt: row.current_period_end,
    };
  } catch (error) {
    await deps.releaseAcceptance(userId).catch(() => undefined);
    throw error;
  }
}

async function requireActiveSubscription(
  deps: RetentionDeps,
  userId: string,
): Promise<RetentionSubscriptionRow> {
  const row = await deps.activeSubscription(userId, deps.livemode);
  if (!row) {
    throw new BillingRetentionError("subscription", "No active Stripe subscription was found");
  }
  return row;
}

async function retrieveOwnedSubscription(
  deps: RetentionDeps,
  row: RetentionSubscriptionRow,
  userId: string,
): Promise<Stripe.Subscription> {
  const subscription = await deps.retrieveSubscription(row.stripe_subscription_id);
  assertSubscriptionOwner(subscription, row, userId, deps.livemode);
  return subscription;
}

// Stripe returns `discounts` as bare ids unless the retrieve expands them, so
// this only answers truthfully for a subscription fetched with
// expand: ["discounts"]. The wiring does exactly that.
export function hasCoupon(subscription: Stripe.Subscription, couponId: string): boolean {
  return subscription.discounts.some((discount) => {
    if (typeof discount === "string") return false;
    const coupon = discount.source?.coupon;
    if (!coupon) return false;
    return typeof coupon === "string" ? coupon === couponId : coupon.id === couponId;
  });
}

function existingDiscountIds(subscription: Stripe.Subscription): string[] {
  return subscription.discounts.map((discount) =>
    typeof discount === "string" ? discount : discount.id,
  );
}

// Same identity gate the plan-change and refund paths use: Stripe is asked for a
// subscription by id, so every mutation first proves the object that came back
// is this account's, in this billing mode.
function assertSubscriptionOwner(
  subscription: Stripe.Subscription,
  row: RetentionSubscriptionRow,
  userId: string,
  livemode: boolean,
): void {
  if (subscription.id !== row.stripe_subscription_id) {
    throw new Error("Stripe returned a different subscription");
  }
  if (subscription.livemode !== livemode) {
    throw new Error("Stripe subscription mode does not match the billing environment");
  }
  if (stripeId(subscription.customer) !== row.stripe_customer_id) {
    throw new Error("Stripe customer does not own this billing record");
  }
  if (subscription.metadata.user_id && subscription.metadata.user_id !== userId) {
    throw new Error("Stripe subscription belongs to another Blueprint account");
  }
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
