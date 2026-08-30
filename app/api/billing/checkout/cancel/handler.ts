import { NextResponse } from "next/server";
import type { BillingAccount } from "@/lib/billing/accounts";
import { stripeCheckoutIdempotencyKey } from "@/lib/billing/workflow";

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
    const reservationId = new URL(request.url).searchParams.get("reservation_id");
    if (!reservationId || !stripeCheckoutIdempotencyKey(reservationId)) {
      return redirect(baseUrl, "error");
    }

    try {
      const session = await deps.getSession();
      if (!session) return redirect(baseUrl, "cancelled");
      const account = await deps.findAccount(session.email);
      if (!account || account.status !== "active") return redirect(baseUrl, "cancelled");

      await deps.cancelIntent({
        userId: account.id,
        livemode: deps.livemode(),
        reservationId,
      });
      return redirect(baseUrl, "cancelled");
    } catch (error) {
      deps.reportError("billing.checkout.cancel_failed", error, {
        provider: "stripe",
        route: "/api/billing/checkout/cancel",
        method: "GET",
      });
      return redirect(baseUrl, "error");
    }
  };
}

function redirect(baseUrl: string, state: "cancelled" | "error"): Response {
  return NextResponse.redirect(new URL(`/pricing?billing=${state}`, baseUrl), 303);
}
