import type Stripe from "stripe";
import { billingLivemode } from "@/lib/billing/config";
import { syncStripeRefund } from "@/lib/billing/refunds";
import { billingStripe } from "@/lib/billing/stripe";
import { markCheckoutSession } from "@/lib/billing/checkout-intents";
import { hasPaidAccessStatus } from "@/lib/billing/policy";
import {
  stripeSubscriptionPlan,
  syncStripeSubscription,
} from "@/lib/billing/subscriptions";
import {
  webhookAuditPayload,
  webhookClaimDecision,
  type WebhookClaimRow,
} from "@/lib/billing/workflow";
import { reportServerError } from "@/lib/observability/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { createWebhookPostHandler } from "./handler";

type ClaimResult = {
  kind: "claimed" | "processed" | "processing";
  attempt: number;
};

export const POST = createWebhookPostHandler({
  webhookSecret: () => process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
  constructEvent: (payload, signature, secret) => billingStripe().webhooks.constructEvent(
    payload,
    signature,
    secret,
  ),
  expectedLivemode: billingLivemode,
  claimEvent,
  processEvent,
  finishEvent,
  failEvent,
  reportError: reportServerError,
});

async function processEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const checkout = event.data.object;
      if (checkout.metadata?.platform !== "1500_blueprint") return;
      const subscriptionId = stripeId(checkout.subscription);
      const customerId = stripeId(checkout.customer);
      const userId = checkout.client_reference_id || checkout.metadata?.user_id || null;

      if (!subscriptionId || !userId || !customerId) {
        throw new Error("completed subscription Checkout is missing its subscription id");
      }
      await reconcileSubscription(subscriptionId, userId, event);
      await markCheckoutSession(
        checkout.id,
        "completed",
        checkoutReservationId(checkout.metadata?.checkout_reservation_id),
      );
      return;
    }
    case "checkout.session.expired": {
      const checkout = event.data.object;
      if (checkout.metadata?.platform !== "1500_blueprint") return;
      await markCheckoutSession(
        checkout.id,
        "expired",
        checkoutReservationId(checkout.metadata?.checkout_reservation_id),
      );
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await reconcileSubscription(event.data.object.id, event.data.object.metadata.user_id || null, event);
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = invoiceSubscriptionId(event.data.object);
      if (!subscriptionId) return;
      await reconcileSubscription(subscriptionId, null, event);
      await syncPaymentState(subscriptionId, event.type === "invoice.payment_failed", event.created);
      return;
    }
    case "refund.updated":
      await syncStripeRefund(event.data.object);
      return;
    case "charge.refunded":
      for (const refund of event.data.object.refunds?.data ?? []) await syncStripeRefund(refund);
      return;
    case "subscription_schedule.created":
    case "subscription_schedule.updated":
    case "subscription_schedule.completed":
    case "subscription_schedule.released":
    case "subscription_schedule.canceled":
    case "subscription_schedule.aborted": {
      const schedule = event.data.object;
      const subscriptionId = stripeId(schedule.subscription) || stripeId(schedule.released_subscription);
      if (subscriptionId) await reconcileSubscription(subscriptionId, schedule.metadata?.user_id || null, event);
      if (
        subscriptionId
        && ["subscription_schedule.released", "subscription_schedule.canceled", "subscription_schedule.aborted"]
          .includes(event.type)
      ) {
        await clearPendingChange(subscriptionId);
      }
      return;
    }
    default:
      return;
  }
}

async function reconcileSubscription(
  subscriptionId: string,
  fallbackUserId: string | null,
  event: Stripe.Event,
): Promise<void> {
  try {
    const subscription = await billingStripe().subscriptions.retrieve(subscriptionId);
    if (!stripeSubscriptionPlan(subscription) && subscription.metadata.platform !== "1500_blueprint") {
      return;
    }
    const ownerId = await resolveSubscriptionOwner(subscription, fallbackUserId);
    if (!ownerId) return;
    await syncStripeSubscription(subscription, ownerId, { id: event.id, created: event.created });
  } catch (error) {
    if (stripeErrorCode(error) !== "resource_missing") throw error;
    if (!event.type.startsWith("customer.subscription.")) throw error;
    const subscription = event.data.object as Stripe.Subscription;
    if (!stripeSubscriptionPlan(subscription) && subscription.metadata.platform !== "1500_blueprint") {
      return;
    }
    const ownerId = await resolveSubscriptionOwner(subscription, fallbackUserId);
    if (!ownerId) return;
    await syncStripeSubscription(subscription, ownerId, {
      id: event.id,
      created: event.created,
    });
  }
}

async function resolveSubscriptionOwner(
  subscription: Stripe.Subscription,
  fallbackUserId: string | null,
): Promise<string | null> {
  const customerId = stripeId(subscription.customer);
  if (!customerId) return null;
  const customerColumn = subscription.livemode
    ? "stripe_live_customer_id"
    : "stripe_test_customer_id";
  const explicitUserId = subscription.metadata.user_id || fallbackUserId || null;

  if (explicitUserId) {
    const { data, error } = await supabaseAdmin()
      .from("users")
      .select(`id,${customerColumn}`)
      .eq("id", explicitUserId)
      .maybeSingle<{ id: string; stripe_live_customer_id?: string | null; stripe_test_customer_id?: string | null }>();
    if (error) throw new Error(`failed to resolve subscription owner: ${error.message}`);
    if (!data) throw new Error(`subscription ${subscription.id} references a missing Blueprint owner`);
    const linkedCustomer = subscription.livemode
      ? data.stripe_live_customer_id
      : data.stripe_test_customer_id;
    if (linkedCustomer && linkedCustomer !== customerId) {
      if (!hasPaidAccessStatus(subscription.status)) return null;
      throw new Error(`subscription ${subscription.id} customer does not match its Blueprint owner`);
    }
    return data.id;
  }

  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("id")
    .eq(customerColumn, customerId)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(`failed to resolve subscription owner: ${error.message}`);
  return data?.id ?? null;
}

async function syncPaymentState(
  subscriptionId: string,
  failed: boolean,
  eventCreated: number,
): Promise<void> {
  const { data: current, error: currentError } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("last_payment_event_created_at")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle<{ last_payment_event_created_at: number | null }>();
  if (currentError) throw new Error(`failed to load payment state: ${currentError.message}`);
  if (current?.last_payment_event_created_at && current.last_payment_event_created_at > eventCreated) return;

  const { error } = await supabaseAdmin()
    .from("student_subscriptions")
    .update({
      payment_failed_at: failed ? new Date(eventCreated * 1000).toISOString() : null,
      last_payment_event_created_at: eventCreated,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);
  if (error) throw new Error(`failed to sync payment state: ${error.message}`);
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
  if (error) throw new Error(`failed to clear completed plan change: ${error.message}`);
}

async function claimEvent(event: Stripe.Event): Promise<ClaimResult> {
  const processingStartedAt = new Date().toISOString();
  const { error: insertError } = await supabaseAdmin()
    .from("billing_webhook_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payload: webhookAuditPayload(event),
      processing_status: "processing",
      attempts: 1,
      processing_started_at: processingStartedAt,
      processing_error: null,
      processed_at: null,
    });
  if (!insertError) return { kind: "claimed", attempt: 1 };
  if (insertError.code !== "23505") {
    throw new Error(`failed to claim webhook event: ${insertError.message}`);
  }

  const { data: existing, error: existingError } = await supabaseAdmin()
    .from("billing_webhook_events")
    .select("processing_status,attempts,processing_started_at")
    .eq("stripe_event_id", event.id)
    .single<WebhookClaimRow>();
  if (existingError) throw new Error(`failed to reload webhook event: ${existingError.message}`);
  const decision = webhookClaimDecision(existing, new Date());
  if (decision === "processed") return { kind: "processed", attempt: existing.attempts };
  if (decision === "processing") return { kind: "processing", attempt: existing.attempts };

  const nextAttempt = existing.attempts + 1;
  const { data: retried, error: retryError } = await supabaseAdmin()
    .from("billing_webhook_events")
    .update({
      processing_status: "processing",
      attempts: nextAttempt,
      processing_started_at: processingStartedAt,
      processing_error: null,
      processed_at: null,
    })
    .eq("stripe_event_id", event.id)
    .eq("processing_status", existing.processing_status)
    .eq("attempts", existing.attempts)
    .select("attempts")
    .maybeSingle<{ attempts: number }>();
  if (retryError) throw new Error(`failed to retry webhook event: ${retryError.message}`);
  return retried
    ? { kind: "claimed", attempt: retried.attempts }
    : { kind: "processing", attempt: existing.attempts };
}

async function finishEvent(eventId: string, attempt: number): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .from("billing_webhook_events")
    .update({
      processing_status: "processed",
      processing_error: null,
      processed_at: new Date().toISOString(),
    })
    .eq("stripe_event_id", eventId)
    .eq("processing_status", "processing")
    .eq("attempts", attempt)
    .select("stripe_event_id")
    .maybeSingle<{ stripe_event_id: string }>();
  if (error) throw new Error(`failed to finish webhook event: ${error.message}`);
  if (!data) throw new Error("webhook processing lease was lost before completion");
}

async function failEvent(eventId: string, attempt: number, message: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("billing_webhook_events")
    .update({
      processing_status: "failed",
      processing_error: message.slice(0, 500),
      processed_at: null,
    })
    .eq("stripe_event_id", eventId)
    .eq("processing_status", "processing")
    .eq("attempts", attempt);
  if (error) {
    reportServerError("billing.webhook.failure_recording_failed", error, {
      provider: "supabase",
      route: "/api/billing/webhook",
      method: "POST",
      correlationId: eventId,
    });
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return stripeId(invoice.parent?.subscription_details?.subscription);
}

function stripeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  return (error as { code?: string }).code ?? null;
}

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function checkoutReservationId(value: string | null | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
