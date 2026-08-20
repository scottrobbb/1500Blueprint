import type Stripe from "stripe";
import { billingStripe } from "@/lib/billing/stripe";
import { syncStripeSubscription } from "@/lib/billing/subscriptions";
import { supabaseAdmin } from "@/utils/supabase/admin";

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
    const { data: processed, error: lookupError } = await supabaseAdmin()
      .from("billing_webhook_events")
      .select("stripe_event_id")
      .eq("stripe_event_id", event.id)
      .maybeSingle<{ stripe_event_id: string }>();
    if (lookupError) throw new Error(`failed to check webhook event: ${lookupError.message}`);
    if (processed) return Response.json({ received: true, duplicate: true });

    await processEvent(event);

    const { error: eventError } = await supabaseAdmin()
      .from("billing_webhook_events")
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        payload: event,
      });
    if (eventError && eventError.code !== "23505") {
      throw new Error(`failed to record webhook event: ${eventError.message}`);
    }
    return Response.json({ received: true });
  } catch (error) {
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
      if (subscriptionId) {
        const subscription = await billingStripe().subscriptions.retrieve(subscriptionId);
        await syncStripeSubscription(subscription, userId);
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await syncStripeSubscription(event.data.object);
      return;
    default:
      return;
  }
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
