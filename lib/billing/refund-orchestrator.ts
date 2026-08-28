import type Stripe from "stripe";
import { isRefundEligible } from "./policy";

export type RefundSubscriptionRow = {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_created_at: string | null;
  refundable_until: string | null;
  refunded_at: string | null;
  stripe_refund_id: string | null;
};

export type RefundRequestRow = {
  id: string;
  status: string;
  stripe_refund_ids: string[];
  amount: number | null;
  currency: string | null;
};

export type RefundablePayment = {
  id: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  amount: number;
  currency: string;
};

export type RefundResult = { refundIds: string[]; amount: number; currency: string };

export class BillingRefundError extends Error {
  constructor(
    public readonly code: "account" | "subscription" | "window" | "already" | "payment" | "processing",
    message: string,
  ) {
    super(message);
    this.name = "BillingRefundError";
  }
}

export type RefundDeps = {
  livemode: boolean;
  now: () => Date;
  findUser: (normalizedEmail: string) => Promise<{ id: string } | null>;
  listPurchases: (userId: string, livemode: boolean) => Promise<RefundSubscriptionRow[]>;
  claimRequest: (subscription: RefundSubscriptionRow, requestedBy: string, livemode: boolean) => Promise<RefundRequestRow>;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
  listPayments: (subscriptionId: string) => Promise<RefundablePayment[]>;
  createRefund: (payment: RefundablePayment, metadata: Record<string, string>, idempotencyKey: string) => Promise<Stripe.Refund>;
  saveRefunds: (requestId: string, input: { refundIds: string[]; paymentIntentIds: string[]; chargeIds: string[]; amount: number; currency: string; status: string; updatedAt: string }) => Promise<void>;
  cancelSubscription: (subscription: Stripe.Subscription) => Promise<Stripe.Subscription>;
  syncSubscription: (subscription: Stripe.Subscription, userId: string) => Promise<void>;
  markSubscriptionRefunded: (subscriptionId: string, refundId: string | null, refundedAt: string) => Promise<void>;
  failRequest: (requestId: string, message: string, updatedAt: string) => Promise<void>;
};

export async function refundFirstPurchaseWithDeps(
  deps: RefundDeps,
  studentEmail: string,
  requestedBy: string,
): Promise<RefundResult> {
  const user = await deps.findUser(studentEmail.trim().toLowerCase());
  if (!user) throw new BillingRefundError("account", "Student account not found");
  const first = (await deps.listPurchases(user.id, deps.livemode))[0];
  if (!first) throw new BillingRefundError("subscription", "No Stripe purchase was found");
  if (first.user_id !== user.id) throw new Error("Refund subscription belongs to another Blueprint account");

  const eligible = isRefundEligible({
    isFirstSubscription: true,
    refundableUntil: first.refundable_until ? new Date(first.refundable_until) : null,
    alreadyRefunded: Boolean(first.refunded_at || first.stripe_refund_id),
    now: deps.now(),
  });
  if (!eligible) {
    if (first.refunded_at || first.stripe_refund_id) {
      throw new BillingRefundError("already", "The first purchase was already refunded");
    }
    throw new BillingRefundError("window", "The 24-hour first-purchase refund window has ended");
  }

  const request = await deps.claimRequest(first, requestedBy, deps.livemode);
  if (request.status === "succeeded") {
    return {
      refundIds: request.stripe_refund_ids,
      amount: request.amount ?? 0,
      currency: request.currency ?? "usd",
    };
  }
  if (request.status === "processing" && request.stripe_refund_ids.length > 0) {
    throw new BillingRefundError("processing", "This refund is already being processed");
  }

  const subscription = await deps.retrieveSubscription(first.stripe_subscription_id);
  assertRefundOwner(subscription, first, user.id, deps.livemode);
  const payments = await deps.listPayments(subscription.id);
  if (!payments.length || payments.some((payment) => payment.amount <= 0)) {
    await deps.failRequest(request.id, "No paid Stripe invoice payment was found", deps.now().toISOString());
    throw new BillingRefundError("payment", "No paid Stripe invoice payment was found");
  }
  if (new Set(payments.map((payment) => payment.currency)).size !== 1) {
    await deps.failRequest(request.id, "Refundable payments use inconsistent currencies", deps.now().toISOString());
    throw new BillingRefundError("payment", "Refundable payments use inconsistent currencies");
  }

  try {
    const refunds: Stripe.Refund[] = [];
    for (const payment of payments) {
      refunds.push(await deps.createRefund(payment, {
        platform: "1500_blueprint",
        user_id: user.id,
        subscription_id: subscription.id,
        refund_request_id: request.id,
      }, `blueprint-refund-${subscription.id}-${payment.id}`));
    }

    const refundIds = refunds.map((refund) => refund.id);
    const amount = refunds.reduce((total, refund) => total + (refund.amount ?? 0), 0);
    const currency = refunds[0]?.currency ?? payments[0].currency;
    await deps.saveRefunds(request.id, {
      refundIds,
      paymentIntentIds: payments.flatMap((payment) => payment.paymentIntentId ? [payment.paymentIntentId] : []),
      chargeIds: payments.flatMap((payment) => payment.chargeId ? [payment.chargeId] : []),
      amount,
      currency,
      status: refunds.every((refund) => refund.status === "succeeded") ? "succeeded" : "pending",
      updatedAt: deps.now().toISOString(),
    });

    const canceled = await deps.cancelSubscription(subscription);
    await deps.syncSubscription(canceled, user.id);
    const refundedAt = deps.now().toISOString();
    await deps.markSubscriptionRefunded(first.id, refundIds[0] ?? null, refundedAt);
    return { refundIds, amount, currency };
  } catch (error) {
    await deps.failRequest(
      request.id,
      error instanceof Error ? error.message : "Refund failed",
      deps.now().toISOString(),
    );
    throw error;
  }
}

function assertRefundOwner(
  subscription: Stripe.Subscription,
  row: RefundSubscriptionRow,
  userId: string,
  livemode: boolean,
): void {
  if (subscription.id !== row.stripe_subscription_id) throw new Error("Stripe returned a different refund subscription");
  if (subscription.livemode !== livemode) throw new Error("Stripe refund subscription mode does not match the billing environment");
  if (stripeId(subscription.customer) !== row.stripe_customer_id) throw new Error("Stripe refund customer does not own this billing record");
  if (subscription.metadata.user_id && subscription.metadata.user_id !== userId) {
    throw new Error("Stripe refund subscription belongs to another Blueprint account");
  }
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
