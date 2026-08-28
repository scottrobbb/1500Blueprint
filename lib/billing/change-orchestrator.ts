import type Stripe from "stripe";
import type { BillablePlan } from "./config";
import type { BillingCadence, BillingOffer } from "./offers";
import { planChangeDirection } from "./policy";

export type ActiveSubscriptionRow = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  pending_plan_code: BillablePlan | null;
  stripe_schedule_id: string | null;
};

export type PlanChangeResult = {
  kind: "unchanged" | "upgrade" | "downgrade" | "pending-change-canceled";
  plan: BillablePlan;
  effectiveAt: string | null;
};

export type PlanChangeDeps = {
  livemode: boolean;
  now: () => Date;
  activeSubscription: (userId: string, livemode: boolean) => Promise<ActiveSubscriptionRow | null>;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
  planForSubscription: (subscription: Stripe.Subscription) => BillablePlan | null;
  cadenceForSubscription: (subscription: Stripe.Subscription) => BillingCadence;
  releaseSchedule: (subscription: Stripe.Subscription) => Promise<Stripe.Subscription>;
  resolvePrice: (plan: BillablePlan, cadence: BillingCadence) => Promise<string>;
  updateSubscription: (id: string, params: Stripe.SubscriptionUpdateParams, idempotencyKey: string) => Promise<Stripe.Subscription>;
  clearPending: (subscriptionId: string) => Promise<void>;
  syncSubscription: (subscription: Stripe.Subscription, userId: string) => Promise<void>;
  offer: (plan: BillablePlan, cadence: BillingCadence) => BillingOffer;
  countSchedules: (customerId: string) => Promise<number>;
  createSchedule: (subscriptionId: string, idempotencyKey: string) => Promise<{ id: string }>;
  updateSchedule: (id: string, params: Stripe.SubscriptionScheduleUpdateParams) => Promise<void>;
  savePending: (subscriptionId: string, input: { plan: BillablePlan; cadence: BillingCadence; effectiveAt: string; scheduleId: string; updatedAt: string }) => Promise<void>;
};

export async function changeBillingPlanWithDeps(
  deps: PlanChangeDeps,
  userId: string,
  targetPlan: BillablePlan,
  targetCadence: BillingCadence,
): Promise<PlanChangeResult> {
  const row = await deps.activeSubscription(userId, deps.livemode);
  if (!row) throw new Error("No active Stripe subscription was found");

  let subscription = await deps.retrieveSubscription(row.stripe_subscription_id);
  assertSubscriptionOwner(subscription, row, userId, deps.livemode);
  const currentPlan = deps.planForSubscription(subscription);
  if (!currentPlan) throw new Error("The current Stripe price is not mapped to a Blueprint plan");
  const currentCadence = deps.cadenceForSubscription(subscription);
  const direction = planChangeDirection(currentPlan, targetPlan);

  if (direction === "same" && currentCadence === targetCadence) {
    if (row.pending_plan_code || subscription.schedule) {
      subscription = await deps.releaseSchedule(subscription);
      assertSubscriptionOwner(subscription, row, userId, deps.livemode);
      await deps.clearPending(subscription.id);
      await deps.syncSubscription(subscription, userId);
      return { kind: "pending-change-canceled", plan: currentPlan, effectiveAt: null };
    }
    return { kind: "unchanged", plan: currentPlan, effectiveAt: null };
  }

  const immediateChange = direction === "upgrade"
    || (direction === "same" && currentCadence === "monthly" && targetCadence === "three_month");
  if (immediateChange) {
    subscription = await deps.releaseSchedule(subscription);
    assertSubscriptionOwner(subscription, row, userId, deps.livemode);
    const item = subscription.items.data[0];
    if (!item) throw new Error("The Stripe subscription has no billable item");
    const targetPriceId = await deps.resolvePrice(targetPlan, targetCadence);
    const idempotencyKey = `blueprint-upgrade-${subscription.id}-${item.current_period_end}-${targetPlan}-${targetCadence}`;
    const updated = await deps.updateSubscription(subscription.id, {
      items: [{ id: item.id, price: targetPriceId, quantity: item.quantity ?? 1 }],
      metadata: {
        ...subscription.metadata,
        plan_code: targetPlan,
        billing_cadence: targetCadence,
        user_id: userId,
      },
      payment_behavior: "error_if_incomplete",
      proration_behavior: "always_invoice",
    }, idempotencyKey);
    await deps.clearPending(subscription.id);
    await deps.syncSubscription(updated, userId);
    return { kind: "upgrade", plan: targetPlan, effectiveAt: null };
  }

  subscription = await deps.releaseSchedule(subscription);
  assertSubscriptionOwner(subscription, row, userId, deps.livemode);
  const items = subscription.items.data;
  if (!items.length) throw new Error("The Stripe subscription has no billable item");
  const periodStart = Math.min(...items.map((item) => item.current_period_start));
  const periodEnd = Math.max(...items.map((item) => item.current_period_end));
  const customerId = stripeId(subscription.customer);
  if (!customerId) throw new Error("The Stripe subscription has no customer");
  const targetOffer = deps.offer(targetPlan, targetCadence);
  const targetPriceId = await deps.resolvePrice(targetPlan, targetCadence);
  const scheduleGeneration = await deps.countSchedules(customerId) + 1;
  const idempotencyKey = `blueprint-downgrade-schedule-${subscription.id}-${periodEnd}-${targetPlan}-${targetCadence}-${scheduleGeneration}`;
  const schedule = await deps.createSchedule(subscription.id, idempotencyKey);
  await deps.updateSchedule(schedule.id, {
    end_behavior: "release",
    metadata: {
      platform: "1500_blueprint",
      user_id: userId,
      subscription_id: subscription.id,
      target_plan: targetPlan,
      target_cadence: targetCadence,
    },
    proration_behavior: "none",
    phases: [
      {
        start_date: periodStart,
        end_date: periodEnd,
        items: items.map((item) => ({ price: item.price.id, quantity: item.quantity ?? 1 })),
        metadata: { ...subscription.metadata, plan_code: currentPlan, user_id: userId },
        proration_behavior: "none",
      },
      {
        start_date: periodEnd,
        duration: { interval: "month", interval_count: targetOffer.intervalCount },
        items: [{ price: targetPriceId, quantity: 1 }],
        metadata: {
          ...subscription.metadata,
          plan_code: targetPlan,
          billing_cadence: targetCadence,
          user_id: userId,
        },
        proration_behavior: "none",
      },
    ],
  });

  const effectiveAt = new Date(periodEnd * 1000).toISOString();
  await deps.savePending(subscription.id, {
    plan: targetPlan,
    cadence: targetCadence,
    effectiveAt,
    scheduleId: schedule.id,
    updatedAt: deps.now().toISOString(),
  });
  return { kind: "downgrade", plan: targetPlan, effectiveAt };
}

function assertSubscriptionOwner(
  subscription: Stripe.Subscription,
  row: ActiveSubscriptionRow,
  userId: string,
  livemode: boolean,
): void {
  if (subscription.id !== row.stripe_subscription_id) throw new Error("Stripe returned a different subscription identity");
  if (subscription.livemode !== livemode) throw new Error("Stripe subscription mode does not match the billing environment");
  if (stripeId(subscription.customer) !== row.stripe_customer_id) throw new Error("Stripe subscription customer does not own this billing record");
  if (subscription.metadata.user_id && subscription.metadata.user_id !== userId) {
    throw new Error("Stripe subscription belongs to another Blueprint account");
  }
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
