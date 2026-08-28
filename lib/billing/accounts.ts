import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import { billingLivemode } from "./config";
import { PAID_ACCESS_STATUSES } from "./policy";
import { billingStripe } from "./stripe";

export type BillingAccount = {
  id: string;
  email: string;
  name: string | null;
  legacyPlan: string | null;
  status: "active" | "suspended" | "archived";
  stripeCustomerId: string | null;
};

type AccountRow = {
  id: string;
  email: string;
  name: string | null;
  plan: string | null;
  account_status: BillingAccount["status"];
  stripe_test_customer_id: string | null;
  stripe_live_customer_id: string | null;
};

export async function findBillingAccount(email: string): Promise<BillingAccount | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("id,email,name,plan,account_status,stripe_test_customer_id,stripe_live_customer_id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<AccountRow>();

  if (error) throw new Error(`failed to load billing account: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    legacyPlan: data.plan,
    status: data.account_status,
    stripeCustomerId: billingLivemode() ? data.stripe_live_customer_id : data.stripe_test_customer_id,
  };
}

export async function hasUntrackedStripeBilling(
  account: BillingAccount,
  hasTrackedSubscriptions: boolean,
): Promise<boolean> {
  const stripe = billingStripe();
  return hasUntrackedStripeBillingWithDeps(account, hasTrackedSubscriptions, {
    listCustomersByEmail: async (email) => {
      const customers = await stripe.customers.list({ email, limit: 100 });
      return customers.data.map((customer) => ({
        id: customer.id,
        deleted: false,
        metadata: customer.metadata,
      }));
    },
    retrieveCustomer: async (customerId) => {
      const customer = await stripe.customers.retrieve(customerId);
      return customer.deleted
        ? { id: customer.id, deleted: true, metadata: {} }
        : { id: customer.id, deleted: false, metadata: customer.metadata };
    },
    listSubscriptionStatuses: async (customerId) => {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      return subscriptions.data.map((subscription) => subscription.status);
    },
  });
}

type BillingCustomerRecord = {
  id: string;
  deleted: boolean;
  metadata: Record<string, string>;
};

export async function hasUntrackedStripeBillingWithDeps(
  account: BillingAccount,
  hasTrackedSubscriptions: boolean,
  deps: {
    listCustomersByEmail: (email: string) => Promise<BillingCustomerRecord[]>;
    retrieveCustomer: (customerId: string) => Promise<BillingCustomerRecord>;
    listSubscriptionStatuses: (customerId: string) => Promise<string[]>;
  },
): Promise<boolean> {
  if (!hasTrackedSubscriptions && hasLegacyBillingMarker(account.legacyPlan)) return true;

  const emailCustomers = await deps.listCustomersByEmail(account.email);
  if (!account.stripeCustomerId) {
    return emailCustomers.some((customer) => !customer.deleted);
  }
  if (emailCustomers.some((customer) => !customer.deleted && customer.id !== account.stripeCustomerId)) {
    return true;
  }

  const customer = await deps.retrieveCustomer(account.stripeCustomerId);
  if (customer.deleted) return true;
  const subscriptionStatuses = await deps.listSubscriptionStatuses(customer.id);
  const paidStatuses = new Set<string>(PAID_ACCESS_STATUSES);
  if (subscriptionStatuses.some((status) => paidStatuses.has(status))) return true;
  if (hasTrackedSubscriptions) return false;

  return customer.metadata.platform !== "1500_blueprint"
    || customer.metadata.user_id !== account.id;
}

export function hasLegacyBillingMarker(plan: string | null | undefined): boolean {
  const normalized = plan?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "free");
}

export async function ensureStripeCustomer(account: BillingAccount): Promise<string> {
  if (account.stripeCustomerId) return account.stripeCustomerId;

  const customer = await billingStripe().customers.create(
    {
      email: account.email,
      name: account.name ?? undefined,
      metadata: { platform: "1500_blueprint", user_id: account.id },
    },
    { idempotencyKey: `1500-blueprint-customer-${account.id}` },
  );

  const { error } = await supabaseAdmin()
    .from("users")
    .update({
      [billingLivemode() ? "stripe_live_customer_id" : "stripe_test_customer_id"]: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)
  if (error) throw new Error(`failed to save Stripe customer: ${error.message}`);
  return customer.id;
}
