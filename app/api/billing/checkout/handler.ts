import { NextResponse } from "next/server";
import type { BillingAccount } from "@/lib/billing/accounts";
import type { BillablePlan } from "@/lib/billing/config";
import { isBillablePlan } from "@/lib/billing/config";
import type { BillingCadence } from "@/lib/billing/offers";
import { isBillingCadence } from "@/lib/billing/offers";
import type { CheckoutIntentClaim } from "@/lib/billing/workflow";
import type { CheckoutCancelResult } from "@/lib/billing/checkout-intents";
import { checkoutRequestToken, stripeCheckoutIdempotencyKey } from "@/lib/billing/workflow";
import { billingReturnPath } from "@/lib/billing/return-path";
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
  // TEMPORARY: promotion codes are open at checkout. Remove this field, the
  // value passed below, and the test that pins it to turn them off again. It
  // cannot be combined with a `discounts` list, so anything added here later
  // has to pick one or the other.
  allow_promotion_codes: boolean;
};

export type BillingSubscriptionState = {
  activeCustomerId: string | null;
  trackedCustomerId: string | null;
  hasTrackedSubscriptions: boolean;
};

export type CheckoutHandlerDeps = {
  baseUrl: (requestUrl: string) => string;
  billingEnabled: () => boolean;
  livemode: () => boolean;
  now: () => number;
  getSession: () => Promise<{ email: string } | null>;
  findAccount: (email: string) => Promise<BillingAccount | null>;
  consumeRateLimit: (scope: string, key: string, options: { limit: number; windowSeconds: number }) => Promise<{ allowed: boolean }>;
  findSubscriptionState: (userId: string, livemode: boolean) => Promise<BillingSubscriptionState>;
  hasUntrackedBilling: (account: BillingAccount, hasTrackedSubscriptions: boolean) => Promise<boolean>;
  changePlan: (userId: string, plan: BillablePlan, cadence: BillingCadence) => Promise<{ kind: "unchanged" | "upgrade" | "downgrade" | "pending-change-canceled" }>;
  createPortal: (customerId: string, returnUrl: string) => Promise<{ url: string }>;
  claimIntent: (input: { userId: string; livemode: boolean; plan: BillablePlan; cadence: BillingCadence; requestToken: string }) => Promise<CheckoutIntentClaim>;
  releaseIntent: (input: { userId: string; livemode: boolean; reservationId: string }) => Promise<boolean>;
  cancelIntent: (input: { userId: string; livemode: boolean; reservationId: string }) => Promise<CheckoutCancelResult>;
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
    if (!deps.billingEnabled()) return redirectToPath(baseUrl, "/pricing?billing=unavailable");

    // Tracks a reservation this request has claimed but not yet turned into a
    // real Stripe Checkout session, so the catch block below can release it on
    // failure instead of leaving it "busy" for the rest of its lease.
    let claimedReservation: { userId: string; livemode: boolean; reservationId: string } | null = null;

    let formData: URLSearchParams;
    try {
      formData = await readUrlEncodedForm(request, MAX_FORM_BYTES);
    } catch (error) {
      return new Response(
        error instanceof RequestBodyTooLargeError ? "Request body is too large" : "Invalid form body",
        { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
      );
    }

    // The surface the student clicked from -- /pricing, /max, /free. Validated to
    // an internal path so it can only ever point back into the app, and read
    // before the try so the catch below can return them there too.
    const returnPath = billingReturnPath(formData.get("returnTo"), "/pricing");

    try {
      const plan = formData.get("plan");
      const cadenceValue = formData.get("cadence") ?? "monthly";
      if (!isBillablePlan(plan)) return redirect(baseUrl, returnPath, "invalid");
      if (!isBillingCadence(cadenceValue)) {
        return redirect(baseUrl, returnPath, "invalid");
      }
      const cadence = cadenceValue;
      const session = await deps.getSession();
      if (!session) {
        // Resume checkout after authenticating instead of returning to the
        // pricing page, which made the student pick the same plan a second
        // time. /checkout re-posts this plan, so the intent survives logging
        // in, creating an account, and email verification.
        const next = `/checkout?plan=${plan}&cadence=${cadence}&returnTo=${encodeURIComponent(returnPath)}`;
        return redirectToPath(baseUrl, `/account/login?next=${encodeURIComponent(next)}`);
      }

      const account = await deps.findAccount(session.email);
      if (!account) return redirectToPath(baseUrl, "/account/claim");
      if (account.status !== "active") return redirect(baseUrl, returnPath, "account");
      const rate = await deps.consumeRateLimit("stripe-checkout", account.id, { limit: 10, windowSeconds: 60 });
      if (!rate.allowed) return redirect(baseUrl, returnPath, "rate-limit");
      const requestToken = checkoutRequestToken(formData.get("checkoutToken"));
      if (!requestToken) return redirect(baseUrl, returnPath, "invalid");
      const livemode = deps.livemode();
      const subscriptionState = await deps.findSubscriptionState(account.id, livemode);
      const existingCustomer = subscriptionState.activeCustomerId;

      if (
        subscriptionState.hasTrackedSubscriptions
        && subscriptionState.trackedCustomerId !== account.stripeCustomerId
      ) {
        return redirect(baseUrl, returnPath, "legacy");
      }
      if (existingCustomer) {
        const result = await deps.changePlan(account.id, plan, cadence);
        if (result.kind !== "unchanged") {
          const state = result.kind === "upgrade"
            ? "upgraded"
            : result.kind === "downgrade"
              ? "downgrade"
              : "change-cancelled";
          return redirect(baseUrl, returnPath, state);
        }
        const portal = await deps.createPortal(existingCustomer, `${baseUrl}${returnPath}`);
        return NextResponse.redirect(portal.url, 303);
      }
      if (await deps.hasUntrackedBilling(account, subscriptionState.hasTrackedSubscriptions)) {
        return redirect(baseUrl, returnPath, "legacy");
      }

      let intent = await deps.claimIntent({
        userId: account.id,
        livemode,
        plan,
        cadence,
        requestToken,
      });
      // Browser back/forward never tells us a Checkout attempt was abandoned --
      // only Stripe's own hosted "Back" link does, via cancel_url. So a reservation
      // for a *different* plan/cadence than what's being requested now almost
      // always means the student changed their mind, not that a duplicate submit
      // is racing. Supersede it once and retry; a genuine same-plan double-submit
      // (the only remaining "busy" case once plan/cadence match) is left alone.
      if (
        intent.decision === "busy"
        && (intent.planCode !== plan || intent.billingCadence !== cadence)
      ) {
        const cancelResult = await deps.cancelIntent({
          userId: account.id,
          livemode,
          reservationId: intent.reservationId,
        });
        if (cancelResult === "completed") {
          // The reservation's own plan actually finished checkout already (a
          // narrow race with the webhook); don't paper over an existing paid
          // subscription by silently starting a different one.
          return redirect(baseUrl, returnPath, "managed");
        }
        if (cancelResult === "missing") {
          // No Stripe session was ever created for it (setup failed before
          // reaching Stripe) -- release the bare reservation row instead.
          await deps.releaseIntent({ userId: account.id, livemode, reservationId: intent.reservationId });
        }
        intent = await deps.claimIntent({ userId: account.id, livemode, plan, cadence, requestToken });
      }
      if (intent.decision === "ready" && intent.checkoutUrl) {
        return NextResponse.redirect(intent.checkoutUrl, 303);
      }
      if (intent.decision === "busy") return redirect(baseUrl, returnPath, "checkout-active");
      claimedReservation = { userId: account.id, livemode, reservationId: intent.reservationId };

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
        cancel_url: `${baseUrl}/api/billing/checkout/cancel?reservation_id=${encodeURIComponent(intent.reservationId)}&return_to=${encodeURIComponent(returnPath)}`,
        expires_at: expiresAt,
        allow_promotion_codes: true,
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
      if (claimedReservation) {
        try {
          await deps.releaseIntent(claimedReservation);
        } catch (releaseError) {
          deps.reportError("billing.checkout.reservation_release_failed", releaseError, {
            provider: "supabase",
            route: "/api/billing/checkout",
            method: "POST",
            correlationId: claimedReservation.reservationId,
          });
        }
      }
      return redirect(baseUrl, returnPath, isPaymentFailure(error) ? "payment" : "error");
    }
  };
}

function redirect(baseUrl: string, returnPath: string, state: string): Response {
  const url = new URL(returnPath, baseUrl);
  url.searchParams.set("billing", state);
  return NextResponse.redirect(url, 303);
}

function redirectToPath(baseUrl: string, path: string): Response {
  return NextResponse.redirect(new URL(path, baseUrl), 303);
}

function isPaymentFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: number; type?: string };
  return candidate.statusCode === 402 || candidate.type === "StripeCardError";
}
