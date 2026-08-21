import "server-only";

import type Stripe from "stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { billingLivemode, priceIdForPlan, type BillablePlan } from "./config";
import { planChangeDirection } from "./policy";
import { billingStripe } from "./stripe";
import { stripeSubscriptionPlan, syncStripeSubscription } from "./subscriptions";

type SubscriptionRow = {
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

export async function changeBillingPlan(
  userId: string,
  targetPlan: BillablePlan,
): Promise<PlanChangeResult> {
  const row = await activeSubscriptionForUser(userId);
  if (!row) throw new Error("No active Stripe subscription was found");

  let subscription: Stripe.Subscription = await billingStripe().subscriptions.retrieve(row.stripe_subscription_id);
  const currentPlan = stripeSubscriptionPlan(subscription);
  if (!currentPlan) throw new Error("The current Stripe price is not mapped to a Blueprint plan");

  const direction = planChangeDirection(currentPlan, targetPlan);
  if (direction === "same") {
    if (row.pending_plan_code || subscription.schedule) {
      subscription = await releaseSchedule(subscription);
      await clearPendingChange(subscription.id);
      await syncStripeSubscription(subscription, userId);
      return { kind: "pending-change-canceled", plan: currentPlan, effectiveAt: null };
    }
    return { kind: "unchanged", plan: currentPlan, effectiveAt: null };
  }

  if (direction === "upgrade") {
    subscription = await releaseSchedule(subscription);
    const item = subscription.items.data[0];
    if (!item) throw new Error("The Stripe subscription has no billable item");

    const updated = await billingStripe().subscriptions.update(
      subscription.id,
      {
        items: [{ id: item.id, price: priceIdForPlan(targetPlan), quantity: item.quantity ?? 1 }],
        metadata: { ...subscription.metadata, plan_code: targetPlan, user_id: userId },
        payment_behavior: "error_if_incomplete",
        proration_behavior: "always_invoice",
      },
      { idempotencyKey: `blueprint-upgrade-${subscription.id}-${item.current_period_end}-${targetPlan}` },
    );
    await clearPendingChange(subscription.id);
    await syncStripeSubscription(updated, userId);
    return { kind: "upgrade", plan: targetPlan, effectiveAt: null };
  }

  subscription = await releaseSchedule(subscription);
  const items = subscription.items.data;
  if (!items.length) throw new Error("The Stripe subscription has no billable item");
  const periodStart = Math.min(...items.map((item) => item.current_period_start));
  const periodEnd = Math.max(...items.map((item) => item.current_period_end));
  const customerId = stripeId(subscription.customer);
  if (!customerId) throw new Error("The Stripe subscription has no customer");
  const priorSchedules = await billingStripe().subscriptionSchedules.list({ customer: customerId, limit: 100 });
  const scheduleGeneration = priorSchedules.data.length + 1;
  const schedule = await billingStripe().subscriptionSchedules.create(
    { from_subscription: subscription.id },
    {
      idempotencyKey:
        `blueprint-downgrade-schedule-${subscription.id}-${periodEnd}-${targetPlan}-${scheduleGeneration}`,
    },
  );

  await billingStripe().subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    metadata: {
      platform: "1500_blueprint",
      user_id: userId,
      subscription_id: subscription.id,
      target_plan: targetPlan,
    },
    proration_behavior: "none",
    phases: [
      {
        start_date: periodStart,
        end_date: periodEnd,
        items: items.map((item) => ({
          price: item.price.id,
          quantity: item.quantity ?? 1,
        })),
        metadata: { ...subscription.metadata, plan_code: currentPlan, user_id: userId },
        proration_behavior: "none",
      },
      {
        start_date: periodEnd,
        duration: { interval: "month", interval_count: 1 },
        items: [{ price: priceIdForPlan(targetPlan), quantity: 1 }],
        metadata: { ...subscription.metadata, plan_code: targetPlan, user_id: userId },
        proration_behavior: "none",
      },
    ],
  });

  const effectiveAt = new Date(periodEnd * 1000).toISOString();
  const { error } = await supabaseAdmin()
    .from("student_subscriptions")
    .update({
      pending_plan_code: targetPlan,
      pending_change_effective_at: effectiveAt,
      stripe_schedule_id: schedule.id,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
  if (error) throw new Error(`failed to save scheduled downgrade: ${error.message}`);

  return { kind: "downgrade", plan: targetPlan, effectiveAt };
}

async function activeSubscriptionForUser(userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("stripe_subscription_id,stripe_customer_id,pending_plan_code,stripe_schedule_id")
    .eq("user_id", userId)
    .eq("livemode", billingLivemode())
    .in("status", ["active", "trialing", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();
  if (error) throw new Error(`failed to load active subscription: ${error.message}`);
  return data ?? null;
}

async function releaseSchedule(subscription: Stripe.Subscription): Promise<Stripe.Subscription> {
  const scheduleId = stripeId(subscription.schedule);
  if (!scheduleId) return subscription;

  const schedule = await billingStripe().subscriptionSchedules.retrieve(scheduleId);
  if (schedule.status === "active" || schedule.status === "not_started") {
    await billingStripe().subscriptionSchedules.release(schedule.id);
  }
  return billingStripe().subscriptions.retrieve(subscription.id);
}

async function clearPendingChange(subscriptionId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("student_subscriptions")
    .update({
      pending_plan_code: null,
      pending_change_effective_at: null,
      stripe_schedule_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);
  if (error) throw new Error(`failed to clear scheduled plan change: ${error.message}`);
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
