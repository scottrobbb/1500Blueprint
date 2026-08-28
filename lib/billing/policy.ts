import type { BillablePlan } from "./config";

export const PAID_ACCESS_STATUSES = ["active", "trialing", "past_due"] as const;

export function hasPaidAccessStatus(status: string): boolean {
  return (PAID_ACCESS_STATUSES as readonly string[]).includes(status);
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
