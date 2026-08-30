import { NextResponse } from "next/server";
import type { BillingAccount } from "@/lib/billing/accounts";
import { isSameOriginRequest } from "@/lib/security/request";
import type { CheckoutCancelResult } from "@/lib/billing/checkout-intents";

// Cancels whatever Checkout reservation is currently on file for the signed-in
// account, without needing the reservation_id Stripe's own cancel_url carries --
// covers a student who abandoned Checkout without using Stripe's hosted "back"
// link (closed the tab, hit browser back), so the reservation never got released
// and now blocks every other plan with "A different Checkout session is still
// open" until this is used or it naturally expires.
export type CheckoutCancelCurrentHandlerDeps = {
  baseUrl: (requestUrl: string) => string;
  getSession: () => Promise<{ email: string } | null>;
  findAccount: (email: string) => Promise<BillingAccount | null>;
  livemode: () => boolean;
  consumeRateLimit: (scope: string, key: string, options: { limit: number; windowSeconds: number }) => Promise<{ allowed: boolean }>;
  findCurrentReservation: (userId: string, livemode: boolean) => Promise<{ reservationId: string } | null>;
  cancelIntent: (input: { userId: string; livemode: boolean; reservationId: string }) => Promise<CheckoutCancelResult>;
  reportError: (event: string, error: unknown, context: Record<string, unknown>) => void;
};

export function createCheckoutCancelCurrentPostHandler(deps: CheckoutCancelCurrentHandlerDeps) {
  return async function checkoutCancelCurrentPost(request: Request): Promise<Response> {
    const baseUrl = deps.baseUrl(request.url);
    if (!isSameOriginRequest(request, baseUrl)) return new Response("Forbidden", { status: 403 });

    try {
      const session = await deps.getSession();
      if (!session) return redirect(baseUrl, "cancelled");
      const account = await deps.findAccount(session.email);
      if (!account || account.status !== "active") return redirect(baseUrl, "cancelled");
      const rate = await deps.consumeRateLimit("stripe-checkout-cancel", account.id, { limit: 10, windowSeconds: 60 });
      if (!rate.allowed) return redirect(baseUrl, "rate-limit");

      const livemode = deps.livemode();
      const reservation = await deps.findCurrentReservation(account.id, livemode);
      if (!reservation) return redirect(baseUrl, "cancelled");

      const result = await deps.cancelIntent({
        userId: account.id,
        livemode,
        reservationId: reservation.reservationId,
      });
      return redirect(baseUrl, result === "completed" ? "managed" : "cancelled");
    } catch (error) {
      deps.reportError("billing.checkout.cancel_current_failed", error, {
        provider: "stripe",
        route: "/api/billing/checkout/cancel-current",
        method: "POST",
      });
      return redirect(baseUrl, "error");
    }
  };
}

function redirect(baseUrl: string, state: string): Response {
  return NextResponse.redirect(new URL(`/pricing?billing=${state}`, baseUrl), 303);
}
