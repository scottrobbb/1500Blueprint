import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import { billingLivemode } from "./config";
import { billingStripe } from "./stripe";

export type BillingAccount = {
  id: string;
  email: string;
  name: string | null;
  status: "active" | "suspended" | "archived";
  stripeCustomerId: string | null;
};

type AccountRow = {
  id: string;
  email: string;
  name: string | null;
  account_status: BillingAccount["status"];
  stripe_test_customer_id: string | null;
  stripe_live_customer_id: string | null;
};

export async function findBillingAccount(email: string): Promise<BillingAccount | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("id,email,name,account_status,stripe_test_customer_id,stripe_live_customer_id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<AccountRow>();

  if (error) throw new Error(`failed to load billing account: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    status: data.account_status,
    stripeCustomerId: billingLivemode() ? data.stripe_live_customer_id : data.stripe_test_customer_id,
  };
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
