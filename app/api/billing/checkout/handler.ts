import { NextResponse } from "next/server";
import type { BillingAccount } from "@/lib/billing/accounts";
import type { BillablePlan } from "@/lib/billing/config";
import { isBillablePlan } from "@/lib/billing/config";
import type { BillingCadence } from "@/lib/billing/offers";
import { isBillingCadence } from "@/lib/billing/offers";
import type { CheckoutIntentClaim } from "@/lib/billing/workflow";
import { checkoutRequestToken, stripeCheckoutIdempotencyKey } from "@/lib/billing/workflow";
import { isSameOriginRequest, readUrlEncodedForm, RequestBodyTooLargeError } from "@/lib/security/request";

const MAX_FORM_BYTES = 16 * 1024;

type CheckoutCreateParams = {
  mode: "subscription";
  customer: string;
  client_reference_id: string;
  line_items: { price: string; quantity: number }[];
  metadata: Record<string, string>;
  subscription_data: { metadata: Record<string, string> };
  success_url: string;
  cancel_url: string;
  expires_at: number;
};

export type CheckoutHandlerDeps = {
  baseUrl: (requestUrl: string) => string;
  livemode: () => boolean;
  now: () => number;
  getSession: () => Promise<{ email: string } | null>;
  findAccount: (email: string) => Promise<BillingAccount | null>;
  consumeRateLimit: (scope: string, key: string, options: { limit: number; windowSeconds: number }) => Promise<{ allowed: boolean }>;
  findActiveSubscriptionCustomer: (userId: string, livemode: boolean) => Promise<string | null>;
  changePlan: (userId: string, plan: BillablePlan, cadence: BillingCadence) => Promise<{ kind: "unchanged" | "upgrade" | "downgrade" | "pending-change-canceled" }>;
  createPortal: (customerId: string, returnUrl: string) => Promise<{ url: string }>;
  claimIntent: (input: { userId: string; livemode: boolean; plan: BillablePlan; cadence: BillingCadence; requestToken: string }) => Promise<CheckoutIntentClaim>;
  ensureCustomer: (account: BillingAccount) => Promise<string>;
  resolvePrice: (plan: BillablePlan, cadence: BillingCadence) => Promise<string>;
  createCheckout: (params: CheckoutCreateParams, idempotencyKey: string) => Promise<{ id: string; url: string | null }>;
  storeCheckout: (input: { userId: string; livemode: boolean; reservationId: string; sessionId: string; sessionUrl: string }) => Promise<void>;
  reportError: (event: string, error: unknown, context: Record<string, unknown>) => void;
};

export function createCheckoutPostHandler(deps: CheckoutHandlerDeps) {
  return async function checkoutPost(request: Request): Promise<Response> {
    const baseUrl = deps.baseUrl(request.url);
    if (!isSameOriginRequest(request, baseUrl)) return new Response("Forbidden", { status: 403 });

    let formData: URLSearchParams;
    try {
      formData = await readUrlEncodedForm(request, MAX_FORM_BYTES);
    } catch (error) {
      return new Response(
        error instanceof RequestBodyTooLargeError ? "Request body is too large" : "Invalid form body",
        { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
      );
    }

    try {
      const plan = formData.get("plan");
      const cadenceValue = formData.get("cadence") ?? "monthly";
      if (!isBillablePlan(plan)) return redirect(baseUrl, "/pricing?billing=invalid");
      if (!isBillingCadence(cadenceValue)) {
        return redirect(baseUrl, "/pricing?billing=invalid");
      }
      const cadence = cadenceValue;
      const session = await deps.getSession();
      if (!session) {
        const next = `/pricing?billing=ready&plan=${plan}&cadence=${cadence}`;
        return redirect(baseUrl, `/account/login?next=${encodeURIComponent(next)}`);
      }

      const account = await deps.findAccount(session.email);
      if (!account) return redirect(baseUrl, "/account/claim");
      if (account.status !== "active") return redirect(baseUrl, "/pricing?billing=account");
      const rate = await deps.consumeRateLimit("stripe-checkout", account.id, { limit: 10, windowSeconds: 60 });
      if (!rate.allowed) return redirect(baseUrl, "/pricing?billing=rate-limit");
      const requestToken = checkoutRequestToken(formData.get("checkoutToken"));
      if (!requestToken) return redirect(baseUrl, "/pricing?billing=invalid");
      const livemode = deps.livemode();
      const existingCustomer = await deps.findActiveSubscriptionCustomer(account.id, livemode);

      if (existingCustomer) {
        const result = await deps.changePlan(account.id, plan, cadence);
        if (result.kind !== "unchanged") {
          const state = result.kind === "upgrade"
            ? "upgraded"
            : result.kind === "downgrade"
              ? "downgrade"
              : "change-cancelled";
          return redirect(baseUrl, `/pricing?billing=${state}`);
        }
        const portal = await deps.createPortal(existingCustomer, `${baseUrl}/pricing`);
        return NextResponse.redirect(portal.url, 303);
      }

      const intent = await deps.claimIntent({
        userId: account.id,
        livemode,
        plan,
        cadence,
        requestToken,
      });
      if (intent.decision === "ready" && intent.checkoutUrl) {
        return NextResponse.redirect(intent.checkoutUrl, 303);
      }
      if (intent.decision === "busy") return redirect(baseUrl, "/pricing?billing=checkout-active");

      const idempotencyKey = stripeCheckoutIdempotencyKey(intent.reservationId);
      const expiresAt = Math.floor(Date.parse(intent.checkoutExpiresAt) / 1000);
      if (!idempotencyKey || expiresAt < Math.floor(deps.now() / 1000) + 30 * 60) {
        throw new Error("Stripe Checkout reservation is too close to expiry");
      }

      const customerId = await deps.ensureCustomer(account);
      const priceId = await deps.resolvePrice(plan, cadence);
      const metadata = {
        platform: "1500_blueprint",
        user_id: account.id,
        plan_code: plan,
        billing_cadence: cadence,
        checkout_reservation_id: intent.reservationId,
      };
      const checkout = await deps.createCheckout({
        mode: "subscription",
        customer: customerId,
        client_reference_id: account.id,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        success_url: `${baseUrl}/api/billing/confirm?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing?billing=cancelled`,
        expires_at: expiresAt,
      }, idempotencyKey);

      if (!checkout.url) throw new Error("Stripe Checkout did not return a redirect URL");
      try {
        await deps.storeCheckout({
          userId: account.id,
          livemode,
          reservationId: intent.reservationId,
          sessionId: checkout.id,
          sessionUrl: checkout.url,
        });
      } catch (error) {
        deps.reportError("billing.checkout.reservation_store_failed", error, {
          provider: "supabase",
          route: "/api/billing/checkout",
          method: "POST",
          correlationId: checkout.id,
        });
      }
      return NextResponse.redirect(checkout.url, 303);
    } catch (error) {
      deps.reportError("billing.checkout.failed", error, {
        provider: "stripe",
        route: "/api/billing/checkout",
        method: "POST",
      });
      return redirect(baseUrl, isPaymentFailure(error) ? "/pricing?billing=payment" : "/pricing?billing=error");
    }
  };
}

function redirect(baseUrl: string, path: string): Response {
  return NextResponse.redirect(new URL(path, baseUrl), 303);
}

function isPaymentFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: number; type?: string };
  return candidate.statusCode === 402 || candidate.type === "StripeCardError";
}
