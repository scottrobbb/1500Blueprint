import type Stripe from "stripe";
import { syncStripeRefund } from "@/lib/billing/refunds";
import { billingStripe } from "@/lib/billing/stripe";
import { syncStripeSubscription } from "@/lib/billing/subscriptions";
import { supabaseAdmin } from "@/utils/supabase/admin";

type WebhookEventRow = {
  processing_status: "processing" | "processed" | "failed";
  attempts: number;
};

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signature || !webhookSecret) {
    return Response.json({ error: "Stripe webhook is not configured" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = billingStripe().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    const claim = await claimEvent(event);
    if (claim === "processed") return Response.json({ received: true, duplicate: true });
    if (claim === "processing") {
      return Response.json({ error: "Webhook event is already processing" }, { status: 409 });
    }

    await processEvent(event);
    await finishEvent(event.id);
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    await failEvent(event.id, message);
    console.error(`Stripe webhook ${event.id} failed:`, error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function processEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const checkout = event.data.object;
      const subscriptionId = stripeId(checkout.subscription);
      const customerId = stripeId(checkout.customer);
      const userId = checkout.client_reference_id || checkout.metadata?.user_id || null;

      if (userId && customerId) {
        const { error } = await supabaseAdmin()
          .from("users")
          .update({
            [event.livemode ? "stripe_live_customer_id" : "stripe_test_customer_id"]: customerId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        if (error) throw new Error(`failed to link Checkout customer: ${error.message}`);
      }
      if (subscriptionId) await reconcileSubscription(subscriptionId, userId, event);
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
    await syncStripeSubscription(subscription, fallbackUserId, { id: event.id, created: event.created });
  } catch (error) {
    if (stripeErrorCode(error) !== "resource_missing") throw error;
    if (!event.type.startsWith("customer.subscription.")) throw error;
    await syncStripeSubscription(event.data.object as Stripe.Subscription, fallbackUserId, {
      id: event.id,
      created: event.created,
    });
  }
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
      pending_change_effective_at: null,
      stripe_schedule_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);
  if (error) throw new Error(`failed to clear completed plan change: ${error.message}`);
}

async function claimEvent(event: Stripe.Event): Promise<"claimed" | "processed" | "processing"> {
  const { error: insertError } = await supabaseAdmin()
    .from("billing_webhook_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payload: event,
      processing_status: "processing",
      attempts: 1,
      processing_error: null,
      processed_at: null,
    });
  if (!insertError) return "claimed";
  if (insertError.code !== "23505") {
    throw new Error(`failed to claim webhook event: ${insertError.message}`);
  }

  const { data: existing, error: existingError } = await supabaseAdmin()
    .from("billing_webhook_events")
    .select("processing_status,attempts")
    .eq("stripe_event_id", event.id)
    .single<WebhookEventRow>();
  if (existingError) throw new Error(`failed to reload webhook event: ${existingError.message}`);
  if (existing.processing_status === "processed") return "processed";
  if (existing.processing_status === "processing") return "processing";

  const { error: retryError } = await supabaseAdmin()
    .from("billing_webhook_events")
    .update({
      processing_status: "processing",
      attempts: existing.attempts + 1,
      processing_error: null,
      processed_at: null,
    })
    .eq("stripe_event_id", event.id)
    .eq("processing_status", "failed");
  if (retryError) throw new Error(`failed to retry webhook event: ${retryError.message}`);
  return "claimed";
}

async function finishEvent(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("billing_webhook_events")
    .update({
      processing_status: "processed",
      processing_error: null,
      processed_at: new Date().toISOString(),
    })
    .eq("stripe_event_id", eventId);
  if (error) throw new Error(`failed to finish webhook event: ${error.message}`);
}

async function failEvent(eventId: string, message: string): Promise<void> {
  await supabaseAdmin()
    .from("billing_webhook_events")
    .update({
      processing_status: "failed",
      processing_error: message.slice(0, 500),
      processed_at: null,
    })
    .eq("stripe_event_id", eventId);
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
