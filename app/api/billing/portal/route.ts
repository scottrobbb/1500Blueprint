import { NextResponse } from "next/server";
import { findBillingAccount } from "@/lib/billing/accounts";
import { billingBaseUrl } from "@/lib/billing/config";
import { billingStripe } from "@/lib/billing/stripe";
import { getSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const baseUrl = billingBaseUrl(request.url);

  try {
    const session = await getSession();
    if (!session) return NextResponse.redirect(`${baseUrl}/account/login`, 303);

    const account = await findBillingAccount(session.email);
    if (!account?.stripeCustomerId) return NextResponse.redirect(`${baseUrl}/pricing`, 303);

    const portal = await billingStripe().billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${baseUrl}/ultimate`,
    });
    return NextResponse.redirect(portal.url, 303);
  } catch (error) {
    console.error("Stripe billing portal creation failed:", error);
    return NextResponse.redirect(`${baseUrl}/pricing?billing=error`, 303);
  }
}
