import "server-only";

import type Stripe from "stripe";
import { normalizePlanCode, type PlanCode } from "@/lib/auth/plans";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { planForPriceId, REFUND_WINDOW_HOURS, type BillablePlan } from "./config";

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function subscriptionPlan(subscription: Stripe.Subscription): BillablePlan | null {
  const priceId = subscription.items.data[0]?.price.id;
  if (priceId) {
    const configuredPlan = planForPriceId(priceId);
    if (configuredPlan) return configuredPlan;
  }
  const metadataPlan = normalizePlanCode(subscription.metadata.plan_code) as PlanCode;
  return metadataPlan === "core" || metadataPlan === "max" ? metadataPlan : null;
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  fallbackUserId?: string | null,
): Promise<void> {
  const customerId = stripeId(subscription.customer);
  const plan = subscriptionPlan(subscription);
  let userId = subscription.metadata.user_id || fallbackUserId || null;

  if (!userId && customerId) {
    const { data, error } = await supabaseAdmin()
      .from("users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(`failed to resolve subscription owner: ${error.message}`);
    userId = data?.id ?? null;
  }

  if (!userId || !customerId || !plan) {
    throw new Error(`subscription ${subscription.id} is missing its Blueprint owner, customer, or plan`);
  }

  const price = subscription.items.data[0]?.price;
  const productId = price ? stripeId(price.product) : null;
  const starts = subscription.items.data.map((item) => item.current_period_start);
  const ends = subscription.items.data.map((item) => item.current_period_end);
  const createdAt = new Date(subscription.created * 1000);
  const { data: existingSubscription, error: purchaseError } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("refundable_until")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle<{ refundable_until: string }>();
  if (purchaseError) throw new Error(`failed to load refund window: ${purchaseError.message}`);
  const refundableUntil = existingSubscription?.refundable_until
    ? new Date(existingSubscription.refundable_until)
    : new Date(createdAt.getTime() + REFUND_WINDOW_HOURS * 60 * 60 * 1000);

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
        refundable_until: refundableUntil.toISOString(),
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
