import { NextResponse } from "next/server";
import { findBillingAccount } from "@/lib/billing/accounts";
import { billingBaseUrl } from "@/lib/billing/config";
import { billingStripe } from "@/lib/billing/stripe";
import { syncStripeSubscription } from "@/lib/billing/subscriptions";
import { getSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  const baseUrl = billingBaseUrl(request.url);

  try {
    const session = await getSession();
    if (!session) return NextResponse.redirect(`${baseUrl}/account/login`, 303);

    const account = await findBillingAccount(session.email);
    const checkoutId = new URL(request.url).searchParams.get("session_id");
    if (!account || !checkoutId) return NextResponse.redirect(`${baseUrl}/pricing?billing=error`, 303);

    const checkout = await billingStripe().checkout.sessions.retrieve(checkoutId);
    if (checkout.client_reference_id !== account.id || checkout.status !== "complete") {
      return NextResponse.redirect(`${baseUrl}/pricing?billing=error`, 303);
    }

    const subscriptionId = stripeId(checkout.subscription);
    if (!subscriptionId) return NextResponse.redirect(`${baseUrl}/pricing?billing=error`, 303);
    const subscription = await billingStripe().subscriptions.retrieve(subscriptionId);
    await syncStripeSubscription(subscription, account.id);
    return NextResponse.redirect(`${baseUrl}/ultimate?billing=success`, 303);
  } catch (error) {
    console.error("Stripe Checkout confirmation failed:", error);
    return NextResponse.redirect(`${baseUrl}/pricing?billing=error`, 303);
  }
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
