import { NextResponse } from "next/server";
import type { BillingAccount } from "@/lib/billing/accounts";

type StripeId = string | { id: string } | null;

export type ConfirmCheckout = {
  id: string;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  mode: string | null;
  status: string | null;
  customer: StripeId;
  subscription: StripeId;
};

export type ConfirmHandlerDeps = {
  baseUrl: (requestUrl: string) => string;
  getSession: () => Promise<{ email: string } | null>;
  findAccount: (email: string) => Promise<BillingAccount | null>;
  retrieveCheckout: (checkoutId: string) => Promise<ConfirmCheckout>;
  retrieveSubscription: (subscriptionId: string) => Promise<unknown>;
  syncSubscription: (subscription: unknown, accountId: string) => Promise<void>;
  markCheckout: (sessionId: string, status: "completed", reservationId: string | null) => Promise<boolean>;
  reportError: (event: string, error: unknown, context: Record<string, unknown>) => void;
};

export function createConfirmGetHandler(deps: ConfirmHandlerDeps) {
  return async function confirmGet(request: Request): Promise<Response> {
    const baseUrl = deps.baseUrl(request.url);
    try {
      const session = await deps.getSession();
      if (!session) return NextResponse.redirect(`${baseUrl}/account/login`, 303);

      const account = await deps.findAccount(session.email);
      const checkoutId = new URL(request.url).searchParams.get("session_id");
      if (!account || !checkoutId) return NextResponse.redirect(`${baseUrl}/pricing?billing=error`, 303);

      const checkout = await deps.retrieveCheckout(checkoutId);
      if (
        checkout.client_reference_id !== account.id
        || checkout.metadata?.platform !== "1500_blueprint"
        || checkout.metadata?.user_id !== account.id
        || checkout.mode !== "subscription"
        || checkout.status !== "complete"
        || stripeId(checkout.customer) !== account.stripeCustomerId
      ) {
        return NextResponse.redirect(`${baseUrl}/pricing?billing=error`, 303);
      }

      const subscriptionId = stripeId(checkout.subscription);
      if (!subscriptionId) return NextResponse.redirect(`${baseUrl}/pricing?billing=error`, 303);
      const subscription = await deps.retrieveSubscription(subscriptionId);
      await deps.syncSubscription(subscription, account.id);
      await deps.markCheckout(
        checkout.id,
        "completed",
        checkoutReservationId(checkout.metadata?.checkout_reservation_id),
      );
      return NextResponse.redirect(`${baseUrl}/ultimate?billing=success`, 303);
    } catch (error) {
      deps.reportError("billing.checkout_confirmation.failed", error, {
        provider: "stripe",
        route: "/api/billing/confirm",
        method: "GET",
      });
      return NextResponse.redirect(`${baseUrl}/pricing?billing=error`, 303);
    }
  };
}

function checkoutReservationId(value: string | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function stripeId(value: StripeId): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
