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

export type ResumeResult = { status: "resumed" | "not-scheduled"; renewsAt: string | null };

export type RetentionAcceptResult = {
  status: "accepted" | "already-applied";
  percentOff: number;
  renewsAt: string | null;
};

export class BillingRetentionError extends Error {
  constructor(
    public readonly code: "account" | "subscription" | "not-offered" | "spent" | "discounted",
    message: string,
  ) {
    super(message);
    this.name = "BillingRetentionError";
  }
}

export type RetentionDeps = {
  livemode: boolean;
  // Null when this environment has no coupon configured for its billing mode.
  // The offer is then never made, and cancelling behaves as it did before it
  // existed -- far better than promising a discount Stripe would reject.
  couponId: string | null;
  percentOff: number;
  activeSubscription: (userId: string, livemode: boolean) => Promise<RetentionSubscriptionRow | null>;
  claimOffer: (userId: string, action: "show" | "accept") => Promise<RetentionClaim>;
  releaseAcceptance: (userId: string) => Promise<void>;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
  cadenceForSubscription: (subscription: Stripe.Subscription) => BillingCadence;
  releaseSchedule: (subscription: Stripe.Subscription) => Promise<Stripe.Subscription>;
  clearPending: (subscriptionId: string) => Promise<void>;
  // A null key means "no idempotency key": correct for state toggles, where a
  // replayed response is more dangerous than a repeated write.
  updateSubscription: (
    id: string,
    params: Stripe.SubscriptionUpdateParams,
    idempotencyKey: string | null,
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

  let subscription = await retrieveOwnedSubscription(deps, row, userId);

  // The save offer is for full-price subscriptions only. A student already on a
  // discount is never shown it — and, because showing is what burns it, is not
  // charged the entitlement either: if that discount later falls off, the offer
  // is still there for them. No configured coupon means no offer, and again no
  // claim: the entitlement is kept for an environment that can honour it.
  if (deps.couponId !== null && !hasAnyDiscount(subscription)) {
    const claim = await deps.claimOffer(userId, "show");
    if (claim.decision === "granted") {
      return {
        status: "offer",
        offer: {
          percentOff: deps.percentOff,
          cadence: deps.cadenceForSubscription(subscription),
          renewsAt: row.current_period_end,
        },
      };
    }
  }

  // A scheduled downgrade would otherwise outlive the cancellation and quietly
  // restart billing on the cheaper plan, so it goes first. Same order the plan
  // change path uses before it mutates a subscription.
  if (row.stripe_schedule_id || row.pending_plan_code || subscription.schedule) {
    subscription = await deps.releaseSchedule(subscription);
    assertSubscriptionOwner(subscription, row, userId, deps.livemode);
    await deps.clearPending(subscription.id);
  }

  // No idempotency key: cancelling is a state toggle, not a charge, so applying
  // it twice is harmless — while a fixed key would make a cancel that follows a
  // resume replay the earlier response and leave Stripe still billing.
  const canceled = await deps.updateSubscription(
    subscription.id,
    { cancel_at_period_end: true, proration_behavior: "none" },
    null,
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
  // Nothing to apply, so this is refused before the claim is taken. Reaching
  // here at all means the offer was never shown, since the cancel path does not
  // make it without a coupon either.
  const couponId = deps.couponId;
  if (couponId === null) {
    throw new BillingRetentionError(
      "not-offered",
      "The save offer is not available on this account right now",
    );
  }

  const row = await requireActiveSubscription(deps, userId);
  const applied = {
    status: "already-applied",
    percentOff: deps.percentOff,
    renewsAt: row.current_period_end,
  } as const;

  // Stripe is the authority on whether this subscription is discounted, so it is
  // read before the claim is taken — an ineligible account must not spend the
  // offer just by asking for it.
  const subscription = await retrieveOwnedSubscription(deps, row, userId);
  if (hasCoupon(subscription, couponId)) return applied;
  if (hasAnyDiscount(subscription)) {
    throw new BillingRetentionError(
      "discounted",
      "This subscription already has a discount, so the save offer does not apply",
    );
  }

  const claim = await deps.claimOffer(userId, "accept");
  if (claim.decision === "not_offered") {
    throw new BillingRetentionError("not-offered", "This offer has not been made to this account");
  }
  if (claim.decision !== "granted") {
    // Someone already holds the claim. Whether that is a double-click still in
    // flight or a spend from an earlier subscription, only the coupon actually
    // sitting on the subscription proves it landed.
    const latest = await retrieveOwnedSubscription(deps, row, userId);
    if (hasCoupon(latest, couponId)) return applied;
    throw new BillingRetentionError("spent", "This save offer has already been used");
  }

  try {
    // Undoing a cancellation is its own write. Keeping it out of the coupon
    // update means those params never vary, so the idempotency key below stays
    // valid on a retry after a released claim.
    const undo = uncancelParams(subscription);
    if (undo) {
      const resumed = await deps.updateSubscription(subscription.id, undo, null);
      assertSubscriptionOwner(resumed, row, userId, deps.livemode);
    }

    // proration_behavior "none" and no item change mean Stripe writes the
    // discount without invoicing: nothing is charged now and the renewal date
    // does not move. The coupon's own `once` duration limits it to that renewal.
    // `discounts` is a whole-list write, and this path is only reached when the
    // list is empty, so the coupon stands alone.
    const updated = await deps.updateSubscription(
      subscription.id,
      { discounts: [{ coupon: couponId }], proration_behavior: "none" },
      `blueprint-retention-${userId}-${subscription.id}`,
    );
    assertSubscriptionOwner(updated, row, userId, deps.livemode);
    await deps.syncSubscription(updated, userId);

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

// Any discount at all, ours or anyone's. Unexpanded entries are bare ids, which
// still prove a discount exists — so this stays correct even when the retrieve
// did not expand them, and errs toward "not eligible" rather than stacking.
export function hasAnyDiscount(subscription: Stripe.Subscription): boolean {
  return subscription.discounts.length > 0;
}

// Undoing a scheduled cancellation. Stripe's portal used to offer this next to
// its cancel button; with that button switched off, this is the only way back,
// so it lives here rather than leaving a student to email support.
export async function resumeSubscriptionWithDeps(
  deps: RetentionDeps,
  userId: string,
): Promise<ResumeResult> {
  const row = await requireActiveSubscription(deps, userId);
  const scheduled = scheduledCancellationAt({
    cancelAt: row.cancel_at,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    currentPeriodEnd: row.current_period_end,
  });
  if (!scheduled) return { status: "not-scheduled", renewsAt: row.current_period_end };

  let subscription = await retrieveOwnedSubscription(deps, row, userId);
  if (subscription.schedule) {
    subscription = await deps.releaseSchedule(subscription);
    assertSubscriptionOwner(subscription, row, userId, deps.livemode);
    await deps.clearPending(subscription.id);
  }

  const undo = uncancelParams(subscription);
  // The row said a cancellation was scheduled but Stripe no longer agrees —
  // a stale sync. Report the truth rather than writing a no-op update.
  if (!undo) return { status: "not-scheduled", renewsAt: row.current_period_end };

  const resumed = await deps.updateSubscription(subscription.id, undo, null);
  assertSubscriptionOwner(resumed, row, userId, deps.livemode);
  await deps.syncSubscription(resumed, userId);

  return { status: "resumed", renewsAt: row.current_period_end };
}

// Clearing a scheduled cancellation, expressed with whichever field actually
// carries it. `cancel_at` supersedes `cancel_at_period_end` on the API version
// this SDK pins, and sending both in one update is rejected outright — which is
// what broke resuming and accepting while plain cancelling kept working, since
// that path only ever sent one. Returns null when there is nothing to undo.
function uncancelParams(
  subscription: Stripe.Subscription,
): Stripe.SubscriptionUpdateParams | null {
  if (typeof subscription.cancel_at === "number") {
    return { cancel_at: "", proration_behavior: "none" };
  }
  if (subscription.cancel_at_period_end) {
    return { cancel_at_period_end: false, proration_behavior: "none" };
  }
  return null;
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
