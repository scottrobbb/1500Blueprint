// The two endpoints behind the in-app cancellation flow.
//
// Neither trusts the browser for eligibility. "Cancel" asks the database whether
// a save offer is still owed and returns the offer instead of cancelling if one
// is; the second call, once the offer has been recorded as shown, goes through.
// That is why "Continue Cancellation" needs no flag from the client that a user
// could forge to skip the offer, and why replaying either call cannot mint a
// second discount.

import { NextResponse } from "next/server";
import type { BillingAccount } from "@/lib/billing/accounts";
import {
  BillingRetentionError,
  type CancellationResult,
  type RetentionAcceptResult,
  type ResumeResult,
} from "@/lib/billing/retention-orchestrator";
import { isSameOriginRequest } from "@/lib/security/request";

export type SubscriptionActionDeps = {
  baseUrl: (requestUrl: string) => string;
  billingEnabled: () => boolean;
  getSession: () => Promise<{ email: string } | null>;
  findAccount: (email: string) => Promise<BillingAccount | null>;
  consumeRateLimit: (
    scope: string,
    key: string,
    options: { limit: number; windowSeconds: number },
  ) => Promise<{ allowed: boolean }>;
  reportError: (event: string, error: unknown, context: Record<string, unknown>) => void;
};

export type CancelDeps = SubscriptionActionDeps & {
  cancelSubscription: (userId: string) => Promise<CancellationResult>;
};

export type RetentionOfferDeps = SubscriptionActionDeps & {
  acceptOffer: (userId: string) => Promise<RetentionAcceptResult>;
};

export type ResumeDeps = SubscriptionActionDeps & {
  resumeSubscription: (userId: string) => Promise<ResumeResult>;
};

const RETENTION_ERROR_STATUS: Record<BillingRetentionError["code"], number> = {
  account: 404,
  subscription: 409,
  "not-offered": 409,
  spent: 409,
  discounted: 409,
};

export function createSubscriptionCancelPostHandler(deps: CancelDeps) {
  return async function subscriptionCancelPost(request: Request): Promise<Response> {
    return runAction(deps, request, {
      route: "/api/billing/subscription/cancel",
      event: "billing.subscription.cancel_failed",
      // A cancellation is two clicks at most; anything past this is a script.
      rateLimit: { scope: "billing-cancel", limit: 8, windowSeconds: 60 },
      run: (userId) => deps.cancelSubscription(userId),
    });
  };
}

export function createRetentionOfferPostHandler(deps: RetentionOfferDeps) {
  return async function retentionOfferPost(request: Request): Promise<Response> {
    return runAction(deps, request, {
      route: "/api/billing/subscription/retention-offer",
      event: "billing.subscription.retention_offer_failed",
      // Tighter than cancel: the offer is single-use, so repeat traffic here is
      // either a double-click or someone probing it.
      rateLimit: { scope: "billing-retention-offer", limit: 5, windowSeconds: 60 },
      run: (userId) => deps.acceptOffer(userId),
    });
  };
}

// Undoing a scheduled cancellation, which Stripe's portal no longer offers.
export function createSubscriptionResumePostHandler(deps: ResumeDeps) {
  return async function subscriptionResumePost(request: Request): Promise<Response> {
    return runAction(deps, request, {
      route: "/api/billing/subscription/resume",
      event: "billing.subscription.resume_failed",
      rateLimit: { scope: "billing-resume", limit: 8, windowSeconds: 60 },
      run: (userId) => deps.resumeSubscription(userId),
    });
  };
}

async function runAction(
  deps: SubscriptionActionDeps,
  request: Request,
  options: {
    route: string;
    event: string;
    rateLimit: { scope: string; limit: number; windowSeconds: number };
    run: (userId: string) => Promise<unknown>;
  },
): Promise<Response> {
  const baseUrl = deps.baseUrl(request.url);
  if (!isSameOriginRequest(request, baseUrl)) return new Response("Forbidden", { status: 403 });
  if (!deps.billingEnabled()) {
    return NextResponse.json({ error: "Billing is not available" }, { status: 503 });
  }

  try {
    const session = await deps.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const account = await deps.findAccount(session.email);
    if (!account || account.status !== "active") {
      return NextResponse.json({ error: "No active billing account was found" }, { status: 404 });
    }

    const rate = await deps.consumeRateLimit(options.rateLimit.scope, account.id, {
      limit: options.rateLimit.limit,
      windowSeconds: options.rateLimit.windowSeconds,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many billing requests. Try again in a minute.", code: "rate_limit" },
        { status: 429 },
      );
    }

    return NextResponse.json(await options.run(account.id));
  } catch (error) {
    if (error instanceof BillingRetentionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: RETENTION_ERROR_STATUS[error.code] },
      );
    }
    deps.reportError(options.event, error, {
      provider: "stripe",
      route: options.route,
      method: "POST",
    });
    return NextResponse.json(
      { error: "Your subscription could not be updated. Please try again." },
      { status: 502 },
    );
  }
}
