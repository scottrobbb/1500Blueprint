import "server-only";

import type Stripe from "stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { billingLivemode } from "./config";
import { billingStripe } from "./stripe";
import { syncStripeSubscription } from "./subscriptions";
import {
  refundFirstPurchaseWithDeps,
  type RefundablePayment,
  type RefundRequestRow,
  type RefundSubscriptionRow,
} from "./refund-orchestrator";

export { BillingRefundError } from "./refund-orchestrator";

export async function refundFirstPurchase(
  studentEmail: string,
  requestedBy: string,
): Promise<{ refundIds: string[]; amount: number; currency: string }> {
  const livemode = billingLivemode();
  return refundFirstPurchaseWithDeps({
    livemode,
    now: () => new Date(),
    findUser: async (email) => {
      const { data, error } = await supabaseAdmin()
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle<{ id: string }>();
      if (error) throw new Error(`failed to load refund account: ${error.message}`);
      return data ?? null;
    },
    listPurchases: listPurchasesForUser,
    claimRequest: claimRefundRequest,
    retrieveSubscription: (id) => billingStripe().subscriptions.retrieve(id),
    listPayments: listRefundablePayments,
    createRefund: (payment, metadata, idempotencyKey) => billingStripe().refunds.create(
      {
        ...(payment.paymentIntentId
          ? { payment_intent: payment.paymentIntentId }
          : { charge: payment.chargeId ?? undefined }),
        reason: "requested_by_customer",
        metadata,
      },
      { idempotencyKey },
    ),
    saveRefunds,
    cancelSubscription: cancelImmediately,
    syncSubscription: (subscription, userId) => syncStripeSubscription(subscription, userId),
    markSubscriptionRefunded,
    failRequest: failRefundRequest,
  }, studentEmail, requestedBy);
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

async function listPurchasesForUser(userId: string, livemode: boolean): Promise<RefundSubscriptionRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("student_subscriptions")
    .select("id,user_id,stripe_subscription_id,stripe_customer_id,stripe_created_at,refundable_until,refunded_at,stripe_refund_id")
    .eq("user_id", userId)
    .eq("livemode", livemode)
    .not("stripe_created_at", "is", null)
    .order("stripe_created_at", { ascending: true })
    .returns<RefundSubscriptionRow[]>();
  if (error) throw new Error(`failed to load refundable subscription: ${error.message}`);
  return data ?? [];
}

async function claimRefundRequest(
  subscription: RefundSubscriptionRow,
  requestedBy: string,
  livemode: boolean,
): Promise<RefundRequestRow> {
  const columns = "id,status,stripe_refund_ids,amount,currency";
  const { data: existing, error: existingError } = await supabaseAdmin()
    .from("billing_refunds")
    .select(columns)
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
      livemode,
      status: "processing",
    })
    .select(columns)
    .single<RefundRequestRow>();
  if (!error && data) return data;
  if (error?.code === "23505") {
    const { data: raced, error: racedError } = await supabaseAdmin()
      .from("billing_refunds")
      .select(columns)
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

async function saveRefunds(
  requestId: string,
  input: {
    refundIds: string[];
    paymentIntentIds: string[];
    chargeIds: string[];
    amount: number;
    currency: string;
    status: string;
    updatedAt: string;
  },
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("billing_refunds")
    .update({
      stripe_refund_ids: input.refundIds,
      stripe_payment_intent_ids: input.paymentIntentIds,
      stripe_charge_ids: input.chargeIds,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      processing_error: null,
      updated_at: input.updatedAt,
    })
    .eq("id", requestId);
  if (error) throw new Error(`failed to save Stripe refunds: ${error.message}`);
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

async function markSubscriptionRefunded(
  subscriptionId: string,
  refundId: string | null,
  refundedAt: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("student_subscriptions")
    .update({
      refunded_at: refundedAt,
      stripe_refund_id: refundId,
      refundable_until: null,
      pending_plan_code: null,
      pending_change_effective_at: null,
      stripe_schedule_id: null,
      updated_at: refundedAt,
    })
    .eq("id", subscriptionId);
  if (error) throw new Error(`failed to mark subscription refunded: ${error.message}`);
}

async function failRefundRequest(refundRequestId: string, message: string, updatedAt: string): Promise<void> {
  await supabaseAdmin()
    .from("billing_refunds")
    .update({
      status: "needs_attention",
      processing_error: message.slice(0, 500),
      updated_at: updatedAt,
    })
    .eq("id", refundRequestId);
}

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
