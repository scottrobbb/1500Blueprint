import { NextResponse } from "next/server";
import type { BillingAccount } from "@/lib/billing/accounts";
import { stripeCheckoutIdempotencyKey } from "@/lib/billing/workflow";
import { billingReturnPath } from "@/lib/billing/return-path";

export type CheckoutCancelHandlerDeps = {
  baseUrl: (requestUrl: string) => string;
  getSession: () => Promise<{ email: string } | null>;
  findAccount: (email: string) => Promise<BillingAccount | null>;
  livemode: () => boolean;
  cancelIntent: (input: {
    userId: string;
    livemode: boolean;
    reservationId: string;
  }) => Promise<unknown>;
  reportError: (event: string, error: unknown, context: Record<string, unknown>) => void;
};

export function createCheckoutCancelGetHandler(deps: CheckoutCancelHandlerDeps) {
  return async function checkoutCancelGet(request: Request): Promise<Response> {
    const baseUrl = deps.baseUrl(request.url);
    const requestUrl = new URL(request.url);
    const reservationId = requestUrl.searchParams.get("reservation_id");
    // Stripe's own "Back" link returns here. The checkout route puts the page
    // the student started from in the cancel_url so backing out lands them
    // where they were rather than on the full plan comparison.
    const returnPath = billingReturnPath(requestUrl.searchParams.get("return_to"), "/pricing");
    if (!reservationId || !stripeCheckoutIdempotencyKey(reservationId)) {
      return redirect(baseUrl, returnPath, "error");
    }

    try {
      const session = await deps.getSession();
      if (!session) return redirect(baseUrl, returnPath, "cancelled");
      const account = await deps.findAccount(session.email);
      if (!account || account.status !== "active") return redirect(baseUrl, returnPath, "cancelled");

      await deps.cancelIntent({
        userId: account.id,
        livemode: deps.livemode(),
        reservationId,
      });
      return redirect(baseUrl, returnPath, "cancelled");
    } catch (error) {
      deps.reportError("billing.checkout.cancel_failed", error, {
        provider: "stripe",
        route: "/api/billing/checkout/cancel",
        method: "GET",
      });
      return redirect(baseUrl, returnPath, "error");
    }
  };
}

function redirect(baseUrl: string, returnPath: string, state: "cancelled" | "error"): Response {
  const url = new URL(returnPath, baseUrl);
  url.searchParams.set("billing", state);
  return NextResponse.redirect(url, 303);
}
