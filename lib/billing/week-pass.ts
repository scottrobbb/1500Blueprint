import "server-only";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { billingLivemode, weekPassCheckoutEnabled } from "./config";
import { billingStripe } from "./stripe";
import { validateWeekPassPayment, weekPassIsActive } from "./week-pass-policy";

export type WeekPass = { starts_at: string; expires_at: string; refunded_at: string | null };

export async function getActiveWeekPass(userId: string): Promise<WeekPass | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin().from("billing_week_passes")
    .select("starts_at,expires_at,refunded_at")
    .eq("user_id", userId).eq("livemode", billingLivemode()).is("refunded_at", null)
    .lte("starts_at", now).gt("expires_at", now)
    .order("expires_at", { ascending: false }).limit(1).maybeSingle<WeekPass>();
  // The additive schema may ship before checkout is enabled.
  if (error && !weekPassCheckoutEnabled() && ["42P01", "PGRST205"].includes(error.code)) return null;
  if (error) throw new Error(`Could not load weekly access: ${error.code}`);
  return data && weekPassIsActive(data) ? data : null;
}

export async function fulfillWeekPass(checkoutId: string): Promise<void> {
  const stripe = billingStripe();
  const session = await stripe.checkout.sessions.retrieve(checkoutId, { expand: ["payment_intent.latest_charge"] });
  const userId = validateWeekPassPayment(session, billingLivemode());
  const payment = session.payment_intent;
  if (!payment || typeof payment === "string" || payment.status !== "succeeded") {
    throw new Error("Weekly payment has not succeeded");
  }
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const customerColumn = session.livemode ? "stripe_live_customer_id" : "stripe_test_customer_id";
  const { data: account, error: accountError } = await supabaseAdmin().from("users")
    .select("id").eq("id", userId).eq(customerColumn, customerId ?? "").eq("account_status", "active").maybeSingle();
  if (accountError || !account) throw new Error("Weekly payment owner does not match an active account");
  const items = await stripe.checkout.sessions.listLineItems(checkoutId, { limit: 2 });
  if (items.data.length !== 1 || items.has_more || items.data[0].quantity !== 1
    || items.data[0].price?.id !== process.env.STRIPE_MAX_WEEK_PRICE_ID?.trim()) {
    throw new Error("Weekly payment has an unexpected Price");
  }
  const charge = payment.latest_charge;
  const refunded = typeof charge === "object" && charge !== null && charge.refunded;
  // DO NOTHING on retries: neither the return URL nor webhook replays can extend access.
  const { error } = await supabaseAdmin().from("billing_week_passes").upsert({
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: payment.id,
    user_id: userId,
    livemode: session.livemode,
    amount_paid: session.amount_total,
    ...(refunded ? { refunded_at: new Date().toISOString() } : {}),
  }, { onConflict: "stripe_checkout_session_id", ignoreDuplicates: true });
  if (error) throw new Error(`Could not fulfill weekly purchase: ${error.code}`);
  if (charge) {
    const latestCharge = await stripe.charges.retrieve(typeof charge === "string" ? charge : charge.id);
    await revokeRefundedWeekPass(latestCharge);
  }
}

export async function revokeRefundedWeekPass(charge: Stripe.Charge): Promise<void> {
  if (!charge.refunded) return;
  const paymentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentId) return;
  const { error } = await supabaseAdmin().from("billing_week_passes")
    .update({ refunded_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentId).eq("livemode", charge.livemode).is("refunded_at", null);
  if (error && !weekPassCheckoutEnabled() && ["42P01", "PGRST205"].includes(error.code)) return;
  if (error) throw new Error(`Could not revoke refunded weekly access: ${error.code}`);
}
