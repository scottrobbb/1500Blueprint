import "server-only";

import type Stripe from "stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { billingLivemode } from "./config";
import { isRefundEligible } from "./policy";
import { billingStripe } from "./stripe";
import { syncStripeSubscription } from "./subscriptions";

type SubscriptionRow = {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_created_at: string | null;
  refundable_until: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
};

type RefundRequestRow = {
  id: string;
  status: string;
  stripe_refund_ids: string[];
};

type RefundablePayment = {
  id: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  amount: number;
  currency: string;
};

export class BillingRefundError extends Error {
  constructor(
    public readonly code: "account" | "subscription" | "window" | "already" | "payment" | "processing",
    message: string,
  ) {
    super(message);
    this.name = "BillingRefundError";
  }
}

export async function refundFirstPurchase(
  studentEmail: string,
  requestedBy: string,
): Promise<{ refundIds: string[]; amount: number; currency: string }> {
  const normalizedEmail = studentEmail.trim().toLowerCase();
  const { data: user, error: userError } = await supabaseAdmin()
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle<{ id: string }>();
  if (userError) throw new Error(`failed to load refund account: ${userError.message}`);
  if (!user) throw new BillingRefundError("account", "Student account not found");

  const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("id,user_id,stripe_subscription_id,stripe_created_at,refundable_until,refunded_at,stripe_refund_id")
    .eq("user_id", user.id)
    .eq("livemode", billingLivemode())
    .not("stripe_created_at", "is", null)
    .order("stripe_created_at", { ascending: true })
    .returns<SubscriptionRow[]>();
  if (subscriptionsError) {
    throw new Error(`failed to load refundable subscription: ${subscriptionsError.message}`);
  }
  const first = subscriptions?.[0];
  if (!first) throw new BillingRefundError("subscription", "No Stripe purchase was found");

  const eligible = isRefundEligible({
    isFirstSubscription: true,
    refundableUntil: first.refundable_until ? new Date(first.refundable_until) : null,
    alreadyRefunded: Boolean(first.refunded_at || first.stripe_refund_id),
    now: new Date(),
  });
  if (!eligible) {
    if (first.refunded_at || first.stripe_refund_id) {
      throw new BillingRefundError("already", "The first purchase was already refunded");
    }
    throw new BillingRefundError("window", "The 24-hour first-purchase refund window has ended");
  }

  const refundRequest = await claimRefundRequest(first, requestedBy);
  if (refundRequest.status === "succeeded") {
    return { refundIds: refundRequest.stripe_refund_ids, amount: 0, currency: "usd" };
  }
  if (refundRequest.status === "processing" && refundRequest.stripe_refund_ids.length > 0) {
    throw new BillingRefundError("processing", "This refund is already being processed");
  }

  const stripe = billingStripe();
  const subscription = await stripe.subscriptions.retrieve(first.stripe_subscription_id);
  const payments = await listRefundablePayments(subscription.id);
  if (!payments.length) {
    await failRefundRequest(refundRequest.id, "No paid Stripe invoice payment was found");
    throw new BillingRefundError("payment", "No paid Stripe invoice payment was found");
  }

  try {
    const refunds: Stripe.Refund[] = [];
    for (const payment of payments) {
      const refund = await stripe.refunds.create(
        {
          ...(payment.paymentIntentId
            ? { payment_intent: payment.paymentIntentId }
            : { charge: payment.chargeId ?? undefined }),
          reason: "requested_by_customer",
          metadata: {
            platform: "1500_blueprint",
            user_id: user.id,
            subscription_id: subscription.id,
            refund_request_id: refundRequest.id,
          },
        },
        { idempotencyKey: `blueprint-refund-${subscription.id}-${payment.id}` },
      );
      refunds.push(refund);
    }

    const refundIds = refunds.map((refund) => refund.id);
    const amount = refunds.reduce((total, refund) => total + (refund.amount ?? 0), 0);
    const currency = refunds[0]?.currency ?? payments[0].currency;
    const { error: savedRefundError } = await supabaseAdmin()
      .from("billing_refunds")
      .update({
        stripe_refund_ids: refundIds,
        stripe_payment_intent_ids: payments.flatMap((payment) => payment.paymentIntentId ? [payment.paymentIntentId] : []),
        stripe_charge_ids: payments.flatMap((payment) => payment.chargeId ? [payment.chargeId] : []),
        amount,
        currency,
        status: refunds.every((refund) => refund.status === "succeeded") ? "succeeded" : "pending",
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundRequest.id);
    if (savedRefundError) throw new Error(`failed to save Stripe refunds: ${savedRefundError.message}`);

    const canceled = await cancelImmediately(subscription);
    await syncStripeSubscription(canceled, user.id);
    const refundedAt = new Date().toISOString();
    const { error: subscriptionError } = await supabaseAdmin()
      .from("student_subscriptions")
      .update({
        refunded_at: refundedAt,
        stripe_refund_id: refundIds[0] ?? null,
        refundable_until: null,
        pending_plan_code: null,
        pending_change_effective_at: null,
        stripe_schedule_id: null,
        updated_at: refundedAt,
      })
      .eq("id", first.id);
    if (subscriptionError) throw new Error(`failed to mark subscription refunded: ${subscriptionError.message}`);
    return { refundIds, amount, currency };
  } catch (error) {
    await failRefundRequest(refundRequest.id, error instanceof Error ? error.message : "Refund failed");
    throw error;
  }
}

export async function syncStripeRefund(refund: Stripe.Refund): Promise<void> {
  const subscriptionId = refund.metadata?.subscription_id;
  if (!subscriptionId) return;
  const { error } = await supabaseAdmin()
    .from("billing_refunds")
    .update({
      status: refund.status ?? "pending",
      processing_error: refund.failure_reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId)
    .eq("livemode", billingLivemode());
  if (error) throw new Error(`failed to sync Stripe refund: ${error.message}`);
}

async function claimRefundRequest(
  subscription: SubscriptionRow,
  requestedBy: string,
): Promise<RefundRequestRow> {
  const { data: existing, error: existingError } = await supabaseAdmin()
    .from("billing_refunds")
    .select("id,status,stripe_refund_ids")
    .eq("student_subscription_id", subscription.id)
    .maybeSingle<RefundRequestRow>();
  if (existingError) throw new Error(`failed to load refund request: ${existingError.message}`);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin()
    .from("billing_refunds")
    .insert({
      user_id: subscription.user_id,
      student_subscription_id: subscription.id,
      stripe_subscription_id: subscription.stripe_subscription_id,
      requested_by: requestedBy,
      livemode: billingLivemode(),
      status: "processing",
    })
    .select("id,status,stripe_refund_ids")
    .single<RefundRequestRow>();
  if (!error && data) return data;
  if (error?.code === "23505") {
    const { data: raced, error: racedError } = await supabaseAdmin()
      .from("billing_refunds")
      .select("id,status,stripe_refund_ids")
      .eq("student_subscription_id", subscription.id)
      .single<RefundRequestRow>();
    if (racedError) throw new Error(`failed to reload refund request: ${racedError.message}`);
    return raced;
  }
  throw new Error(`failed to create refund request: ${error?.message ?? "unknown error"}`);
}

async function listRefundablePayments(subscriptionId: string): Promise<RefundablePayment[]> {
  const stripe = billingStripe();
  const invoices = await stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 100 });
  const payments: RefundablePayment[] = [];
  for (const invoice of invoices.data) {
    const invoicePayments = await stripe.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 100 });
    for (const invoicePayment of invoicePayments.data) {
      const paymentIntentId = stripeId(invoicePayment.payment.payment_intent);
      const chargeId = stripeId(invoicePayment.payment.charge);
      if (!paymentIntentId && !chargeId) continue;
      payments.push({
        id: invoicePayment.id,
        paymentIntentId,
        chargeId,
        amount: invoicePayment.amount_paid ?? invoicePayment.amount_requested,
        currency: invoicePayment.currency,
      });
    }
  }
  return payments;
}

async function cancelImmediately(subscription: Stripe.Subscription): Promise<Stripe.Subscription> {
  if (subscription.status === "canceled") return subscription;
  const scheduleId = stripeId(subscription.schedule);
  if (scheduleId) {
    const schedule = await billingStripe().subscriptionSchedules.retrieve(scheduleId);
    if (schedule.status === "active" || schedule.status === "not_started") {
      await billingStripe().subscriptionSchedules.cancel(schedule.id, { invoice_now: false, prorate: false });
      return billingStripe().subscriptions.retrieve(subscription.id);
    }
  }
  return billingStripe().subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
}

async function failRefundRequest(refundRequestId: string, message: string): Promise<void> {
  await supabaseAdmin()
    .from("billing_refunds")
    .update({
      status: "needs_attention",
      processing_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", refundRequestId);
}

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
