import { NextResponse } from "next/server";
import { findBillingAccount, ensureStripeCustomer } from "@/lib/billing/accounts";
import { changeBillingPlan } from "@/lib/billing/changes";
import { billingBaseUrl, billingLivemode, isBillablePlan, priceIdForPlan } from "@/lib/billing/config";
import { billingStripe } from "@/lib/billing/stripe";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function POST(request: Request) {
  const baseUrl = billingBaseUrl(request.url);

  try {
    const formData = await request.formData();
    const plan = formData.get("plan");
    if (!isBillablePlan(plan)) return redirect(baseUrl, "/pricing?billing=invalid");

    const session = await getSession();
    if (!session) {
      return redirect(baseUrl, `/account/login?next=${encodeURIComponent("/pricing")}`);
    }

    const account = await findBillingAccount(session.email);
    if (!account) return redirect(baseUrl, "/account/claim");
    if (account.status !== "active") return redirect(baseUrl, "/pricing?billing=account");

    const { data: existing, error } = await supabaseAdmin()
      .from("student_subscriptions")
      .select("stripe_customer_id,plan_code,pending_plan_code")
      .eq("user_id", account.id)
      .eq("livemode", billingLivemode())
      .in("status", ["active", "trialing", "past_due"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        stripe_customer_id: string;
        plan_code: string;
        pending_plan_code: string | null;
      }>();
    if (error) throw new Error(`failed to check current subscription: ${error.message}`);

    if (existing?.stripe_customer_id) {
      if (existing.plan_code !== plan || existing.pending_plan_code) {
        const result = await changeBillingPlan(account.id, plan);
        const state = result.kind === "upgrade"
          ? "upgraded"
          : result.kind === "downgrade"
            ? "downgrade"
            : result.kind === "pending-change-canceled"
              ? "change-cancelled"
              : "managed";
        return redirect(baseUrl, `/pricing?billing=${state}`);
      }
      const portal = await billingStripe().billingPortal.sessions.create({
        customer: existing.stripe_customer_id,
        return_url: `${baseUrl}/pricing`,
      });
      return NextResponse.redirect(portal.url, 303);
    }

    const customerId = await ensureStripeCustomer(account);
    const checkout = await billingStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: account.id,
      line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      metadata: { platform: "1500_blueprint", user_id: account.id, plan_code: plan },
      subscription_data: {
        metadata: { platform: "1500_blueprint", user_id: account.id, plan_code: plan },
      },
      success_url: `${baseUrl}/api/billing/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing?billing=cancelled`,
    });

    if (!checkout.url) throw new Error("Stripe Checkout did not return a redirect URL");
    return NextResponse.redirect(checkout.url, 303);
  } catch (error) {
    console.error("Stripe Checkout creation failed:", error);
    return redirect(baseUrl, isPaymentFailure(error) ? "/pricing?billing=payment" : "/pricing?billing=error");
  }
}

function redirect(baseUrl: string, path: string) {
  return NextResponse.redirect(new URL(path, baseUrl), 303);
}

function isPaymentFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: number; type?: string };
  return candidate.statusCode === 402 || candidate.type === "StripeCardError";
}
