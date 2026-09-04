import type { BillablePlan } from "./config";
import type { BillingCadence } from "./offers";

export const PAID_ACCESS_STATUSES = ["active", "trialing", "past_due"] as const;

export function hasPaidAccessStatus(status: string): boolean {
  return (PAID_ACCESS_STATUSES as readonly string[]).includes(status);
}

// How long a failed renewal keeps access while Stripe retries the card. Short
// enough that a subscription nobody is paying for cannot fund months of study.
export const PAYMENT_FAILURE_GRACE_DAYS = 3;

const GRACE_MS = PAYMENT_FAILURE_GRACE_DAYS * 24 * 60 * 60 * 1000;

// Whether a synced subscription row still earns its plan.
//
// past_due is in PAID_ACCESS_STATUSES on purpose: a card that fails on renewal
// should not drop a student out of the platform the same minute. But Stripe's
// retry schedule can hold a subscription at past_due for weeks, and a dunning
// setting of "do nothing" holds it there permanently -- so status alone is an
// unbounded grace, which is just a free subscription with extra steps. The
// clock runs from the recorded failure instead, and a recovery clears it
// (invoice.paid nulls payment_failed_at as it flips the status back).
export function subscriptionGrantsAccess(
  subscription: { status: string; paymentFailedAt: string | null },
  now: Date,
): boolean {
  if (!hasPaidAccessStatus(subscription.status)) return false;
  if (subscription.status !== "past_due") return true;
  // past_due with no recorded failure: customer.subscription.updated landed
  // before invoice.payment_failed. There is no clock to run yet, and the event
  // that starts it is moments behind -- so this keeps the grace rather than
  // revoking on a race.
  if (!subscription.paymentFailedAt) return true;
  const failedAt = Date.parse(subscription.paymentFailedAt);
  if (Number.isNaN(failedAt)) return true;
  return now.getTime() <= failedAt + GRACE_MS;
}

export function planChangeDirection(
  currentPlan: BillablePlan,
  targetPlan: BillablePlan,
): "same" | "upgrade" | "downgrade" {
  if (currentPlan === targetPlan) return "same";
  return currentPlan === "core" && targetPlan === "max" ? "upgrade" : "downgrade";
}

export function scheduledCancellationAt({
  cancelAt,
  cancelAtPeriodEnd,
  currentPeriodEnd,
}: {
  cancelAt: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}): string | null {
  return cancelAt ?? (cancelAtPeriodEnd ? currentPeriodEnd : null);
}

export function pendingChangeHasTakenEffect({
  currentPlan,
  currentCadence,
  pendingPlan,
  pendingCadence,
}: {
  currentPlan: BillablePlan;
  currentCadence: BillingCadence;
  pendingPlan: BillablePlan | null;
  pendingCadence: BillingCadence | null;
}): boolean {
  return pendingPlan === currentPlan
    && (pendingCadence === null || pendingCadence === currentCadence);
}

export function refundDeadline(firstPurchaseAt: Date, windowHours: number): Date {
  return new Date(firstPurchaseAt.getTime() + windowHours * 60 * 60 * 1000);
}

export function isRefundEligible({
  isFirstSubscription,
  refundableUntil,
  alreadyRefunded,
  now,
}: {
  isFirstSubscription: boolean;
  refundableUntil: Date | null;
  alreadyRefunded: boolean;
  now: Date;
}): boolean {
  return isFirstSubscription
    && !alreadyRefunded
    && refundableUntil !== null
    && now.getTime() <= refundableUntil.getTime();
}
