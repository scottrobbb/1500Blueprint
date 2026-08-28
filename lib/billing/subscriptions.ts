import "server-only";

import type Stripe from "stripe";
import { normalizePlanCode, type PlanCode } from "@/lib/auth/plans";
import { supabaseAdmin } from "@/utils/supabase/admin";
import {
  planForLegacyProductId,
  planForPriceId,
  REFUND_WINDOW_HOURS,
  type BillablePlan,
} from "./config";
import { billingCadenceForInterval, type BillingCadence } from "./offers";
import { refundDeadline } from "./policy";
import { subscriptionIdentityConflict } from "./workflow";

type StripeEventContext = {
  id: string;
  created: number;
};

type ExistingSubscriptionRow = {
  user_id: string;
  stripe_customer_id: string;
  livemode: boolean;
  refundable_until: string | null;
  pending_plan_code: string | null;
  pending_change_effective_at: string | null;
  stripe_schedule_id: string | null;
  last_stripe_event_created_at: number | null;
  last_stripe_event_id: string | null;
};

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function stripeSubscriptionPlan(subscription: Stripe.Subscription): BillablePlan | null {
  const price = subscription.items.data[0]?.price;
  if (price) {
    const configuredPlan = planForPriceId(price.id);
    if (configuredPlan) return configuredPlan;

    const productId = stripeId(price.product);
    if (productId) {
      const legacyPlan = planForLegacyProductId(productId);
      if (legacyPlan) return legacyPlan;
    }
  }
  const metadataPlan = normalizePlanCode(subscription.metadata.plan_code) as PlanCode;
  return metadataPlan === "core" || metadataPlan === "max" ? metadataPlan : null;
}

export function stripeSubscriptionCadence(subscription: Stripe.Subscription): BillingCadence {
  const price = subscription.items.data[0]?.price;
  if (price?.recurring) {
    return billingCadenceForInterval(price.recurring.interval, price.recurring.interval_count);
  }
  return subscription.metadata.billing_cadence === "three_month" ? "three_month" : "monthly";
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  fallbackUserId?: string | null,
  event?: StripeEventContext,
): Promise<void> {
  const customerId = stripeId(subscription.customer);
  const plan = stripeSubscriptionPlan(subscription);
  let userId = subscription.metadata.user_id || fallbackUserId || null;

  if (!userId && customerId) {
    const { data, error } = await supabaseAdmin()
      .from("users")
      .select("id")
      .eq(subscription.livemode ? "stripe_live_customer_id" : "stripe_test_customer_id", customerId)
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(`failed to resolve subscription owner: ${error.message}`);
    userId = data?.id ?? null;
  }

  if (!userId || !customerId || !plan) {
    throw new Error(`subscription ${subscription.id} is missing its Blueprint owner, customer, or plan`);
  }

  const customerColumn = subscription.livemode
    ? "stripe_live_customer_id"
    : "stripe_test_customer_id";
  const { data: account, error: accountError } = await supabaseAdmin()
    .from("users")
    .select(`id,${customerColumn}`)
    .eq("id", userId)
    .maybeSingle<{ id: string; stripe_live_customer_id?: string | null; stripe_test_customer_id?: string | null }>();
  if (accountError) throw new Error(`failed to verify subscription owner: ${accountError.message}`);
  if (!account) throw new Error(`subscription ${subscription.id} references a missing Blueprint owner`);
  const { data: customerOwner, error: customerOwnerError } = await supabaseAdmin()
    .from("users")
    .select("id")
    .eq(customerColumn, customerId)
    .maybeSingle<{ id: string }>();
  if (customerOwnerError) {
    throw new Error(`failed to verify Stripe customer ownership: ${customerOwnerError.message}`);
  }
  if (customerOwner && customerOwner.id !== userId) {
    throw new Error(`subscription ${subscription.id} customer belongs to another Blueprint owner`);
  }
  const linkedCustomer = subscription.livemode
    ? account.stripe_live_customer_id
    : account.stripe_test_customer_id;
  if (linkedCustomer && linkedCustomer !== customerId) {
    throw new Error(`subscription ${subscription.id} customer does not match its Blueprint owner`);
  }

  const price = subscription.items.data[0]?.price;
  const productId = price ? stripeId(price.product) : null;
  const starts = subscription.items.data.map((item) => item.current_period_start);
  const ends = subscription.items.data.map((item) => item.current_period_end);
  const createdAt = new Date(subscription.created * 1000);
  const { data: existingSubscription, error: purchaseError } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("user_id,stripe_customer_id,livemode,refundable_until,pending_plan_code,pending_change_effective_at,stripe_schedule_id,last_stripe_event_created_at,last_stripe_event_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle<ExistingSubscriptionRow>();
  if (purchaseError) throw new Error(`failed to load refund window: ${purchaseError.message}`);

  const identityConflict = subscriptionIdentityConflict(
    existingSubscription
      ? {
          userId: existingSubscription.user_id,
          customerId: existingSubscription.stripe_customer_id,
          livemode: existingSubscription.livemode,
        }
      : null,
    { userId, customerId, livemode: subscription.livemode },
  );
  if (identityConflict) {
    throw new Error(`subscription ${subscription.id} cannot change its ${identityConflict} identity`);
  }

  if (
    event
    && existingSubscription?.last_stripe_event_created_at
    && existingSubscription.last_stripe_event_created_at > event.created
  ) {
    return;
  }

  const { data: earlierPurchase, error: earlierPurchaseError } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .eq("livemode", subscription.livemode)
    .neq("stripe_subscription_id", subscription.id)
    .not("stripe_created_at", "is", null)
    .lt("stripe_created_at", createdAt.toISOString())
    .order("stripe_created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ stripe_subscription_id: string }>();
  if (earlierPurchaseError) {
    throw new Error(`failed to load first purchase: ${earlierPurchaseError.message}`);
  }

  const refundableUntil = existingSubscription?.refundable_until
    ? new Date(existingSubscription.refundable_until)
    : earlierPurchase
      ? null
      : refundDeadline(createdAt, REFUND_WINDOW_HOURS);
  const scheduleId = stripeId(subscription.schedule);
  const pendingPlan = existingSubscription?.pending_plan_code === plan || !scheduleId
    ? null
    : existingSubscription?.pending_plan_code ?? null;

  const { error } = await supabaseAdmin()
    .from("student_subscriptions")
    .upsert(
      {
        user_id: userId,
        provider: "stripe",
        plan_code: plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_product_id: productId,
        stripe_price_id: price?.id ?? null,
        status: subscription.status,
        current_period_start: starts.length ? new Date(Math.min(...starts) * 1000).toISOString() : null,
        current_period_end: ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        livemode: subscription.livemode,
        stripe_created_at: createdAt.toISOString(),
        refundable_until: refundableUntil?.toISOString() ?? null,
        pending_plan_code: pendingPlan,
        pending_change_effective_at: pendingPlan
          ? existingSubscription?.pending_change_effective_at ?? null
          : null,
        stripe_schedule_id: scheduleId,
        last_stripe_event_created_at: event?.created ?? existingSubscription?.last_stripe_event_created_at ?? null,
        last_stripe_event_id: event?.id ?? existingSubscription?.last_stripe_event_id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );
  if (error) throw new Error(`failed to sync Stripe subscription: ${error.message}`);

  const { error: customerError } = await supabaseAdmin()
    .from("users")
    .update({
      [subscription.livemode ? "stripe_live_customer_id" : "stripe_test_customer_id"]: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (customerError) throw new Error(`failed to link Stripe customer: ${customerError.message}`);
}
