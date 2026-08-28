import "server-only";

import type Stripe from "stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { billingLivemode, type BillablePlan } from "./config";
import { billingOffer, type BillingCadence } from "./offers";
import { resolveBillingPriceId } from "./prices";
import { billingStripe } from "./stripe";
import {
  stripeSubscriptionCadence,
  stripeSubscriptionPlan,
  syncStripeSubscription,
} from "./subscriptions";
import {
  changeBillingPlanWithDeps,
  type ActiveSubscriptionRow,
  type PlanChangeResult,
} from "./change-orchestrator";

export type { PlanChangeResult } from "./change-orchestrator";

export async function changeBillingPlan(
  userId: string,
  targetPlan: BillablePlan,
  targetCadence: BillingCadence,
): Promise<PlanChangeResult> {
  return changeBillingPlanWithDeps({
    livemode: billingLivemode(),
    now: () => new Date(),
    activeSubscription: activeSubscriptionForUser,
    retrieveSubscription: (id) => billingStripe().subscriptions.retrieve(id),
    planForSubscription: stripeSubscriptionPlan,
    cadenceForSubscription: stripeSubscriptionCadence,
    releaseSchedule,
    resolvePrice: resolveBillingPriceId,
    updateSubscription: (id, params, idempotencyKey) => billingStripe().subscriptions.update(
      id,
      params,
      { idempotencyKey },
    ),
    clearPending: clearPendingChange,
    syncSubscription: (subscription, ownerId) => syncStripeSubscription(subscription, ownerId),
    offer: billingOffer,
    countSchedules: async (customerId) => {
      const schedules = await billingStripe().subscriptionSchedules.list({ customer: customerId, limit: 100 });
      return schedules.data.length;
    },
    createSchedule: (subscriptionId, idempotencyKey) => billingStripe().subscriptionSchedules.create(
      { from_subscription: subscriptionId },
      { idempotencyKey },
    ),
    updateSchedule: async (id, params) => {
      await billingStripe().subscriptionSchedules.update(id, params);
    },
    savePending: savePendingChange,
  }, userId, targetPlan, targetCadence);
}

async function activeSubscriptionForUser(
  userId: string,
  livemode: boolean,
): Promise<ActiveSubscriptionRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("stripe_subscription_id,stripe_customer_id,pending_plan_code,stripe_schedule_id")
    .eq("user_id", userId)
    .eq("livemode", livemode)
    .in("status", ["active", "trialing", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<ActiveSubscriptionRow>();
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
      pending_billing_cadence: null,
      pending_change_effective_at: null,
      stripe_schedule_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);
  if (error) throw new Error(`failed to clear scheduled plan change: ${error.message}`);
}

async function savePendingChange(
  subscriptionId: string,
  input: { plan: BillablePlan; cadence: BillingCadence; effectiveAt: string; scheduleId: string; updatedAt: string },
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("student_subscriptions")
    .update({
      pending_plan_code: input.plan,
      pending_billing_cadence: input.cadence,
      pending_change_effective_at: input.effectiveAt,
      stripe_schedule_id: input.scheduleId,
      updated_at: input.updatedAt,
    })
    .eq("stripe_subscription_id", subscriptionId);
  if (error) throw new Error(`failed to save scheduled downgrade: ${error.message}`);
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
