import "server-only";
import type Stripe from "stripe";
import { canonicalAppUrl } from "@/lib/auth/config";
import { billingStripe } from "@/lib/billing/stripe";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { purchasePayload, type ConversionContext } from "./conversions";
import { conversionsEnabled, enqueueConversion, loadConversionContext } from "./delivery";

export async function notifyPurchase(invoice: Stripe.Invoice, subscriptionId: string): Promise<void> {
  if (!conversionsEnabled() || !invoice.livemode || invoice.billing_reason !== "subscription_create") return;
  const db = supabaseAdmin();
  const subscription = await db.from("student_subscriptions").select("user_id,stripe_customer_id")
    .eq("stripe_subscription_id", subscriptionId).eq("livemode", true)
    .maybeSingle<{ user_id: string; stripe_customer_id: string }>();
  if (subscription.error) throw new Error(`Could not load conversion owner: ${subscription.error.code}`);
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!subscription.data || subscription.data.stripe_customer_id !== customerId) return;
  const account = await db.from("users").select("email,name,is_test_account")
    .eq("id", subscription.data.user_id).maybeSingle<{ email: string; name: string | null; is_test_account: boolean }>();
  if (account.error) throw new Error(`Could not load conversion account: ${account.error.code}`);
  if (!account.data || account.data.is_test_account) return;
  const context = await loadConversionContext(account.data.email);
  const fallback: ConversionContext = {
    fbclid: null, fbc: null, fbp: null, utm_medium: null, landing_page: null,
    event_source_url: `${canonicalAppUrl()}/checkout`, client_ip_address: null, client_user_agent: null,
  };
  // invoice.paid also fires for invoices manually marked paid. InvoicePayment
  // records prove Stripe collected money and exclude credits/out-of-band marks.
  let collectedAmount = 0;
  for await (const payment of billingStripe().invoicePayments.list({
    invoice: invoice.id, status: "paid", payment: { type: "payment_intent" }, limit: 100,
  })) {
    if (payment.livemode && payment.currency === invoice.currency) collectedAmount += payment.amount_paid ?? 0;
  }
  const payload = purchasePayload(invoice, account.data.email, account.data.name ?? invoice.customer_name ?? "", { ...fallback, ...context }, collectedAmount);
  if (payload) await enqueueConversion(payload);
}
