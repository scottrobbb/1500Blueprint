import { NextResponse } from "next/server";
import { findBillingAccount } from "@/lib/billing/accounts";
import { billingBaseUrl } from "@/lib/billing/config";
import { billingReturnPath } from "@/lib/billing/return-path";
import { billingStripe } from "@/lib/billing/stripe";
import { getSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const baseUrl = billingBaseUrl(request.url);
  const formData = await request.formData().catch(() => null);
  const returnPath = billingReturnPath(formData?.get("returnTo") ?? null);

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.redirect(
        `${baseUrl}/account/login?next=${encodeURIComponent(returnPath)}`,
        303,
      );
    }

    const account = await findBillingAccount(session.email);
    if (!account?.stripeCustomerId) return NextResponse.redirect(`${baseUrl}/pricing`, 303);

    const portal = await billingStripe().billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: new URL(returnPath, baseUrl).toString(),
    });
    return NextResponse.redirect(portal.url, 303);
  } catch (error) {
    console.error("Stripe billing portal creation failed:", error);
    const errorUrl = new URL(returnPath, baseUrl);
    errorUrl.searchParams.set("billing", "error");
    return NextResponse.redirect(errorUrl, 303);
  }
}
