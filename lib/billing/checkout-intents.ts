import "server-only";

import type { BillablePlan } from "./config";
import type { BillingCadence } from "./offers";
import {
  parseCheckoutIntentClaim,
  stripeCheckoutIdempotencyKey,
  type CheckoutIntentClaim,
} from "./workflow";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { billingStripe } from "./stripe";

export async function claimCheckoutIntent(input: {
  userId: string;
  livemode: boolean;
  plan: BillablePlan;
  cadence: BillingCadence;
  requestToken: string;
}): Promise<CheckoutIntentClaim> {
  const { data, error } = await supabaseAdmin()
    .rpc("claim_billing_checkout_intent", {
      p_user_id: input.userId,
      p_livemode: input.livemode,
      p_plan_code: input.plan,
      p_billing_cadence: input.cadence,
      p_request_token: input.requestToken,
    })
    .single();
  if (error) throw new Error(`failed to reserve Stripe Checkout: ${error.message}`);
  const claim = parseCheckoutIntentClaim(data);
  if (!claim) throw new Error("Stripe Checkout reservation returned an invalid result");
  return claim;
}

export async function storeCheckoutSession(input: {
  userId: string;
  livemode: boolean;
  reservationId: string;
  sessionId: string;
  sessionUrl: string;
}): Promise<void> {
  const { data, error } = await supabaseAdmin().rpc("store_billing_checkout_session", {
    p_user_id: input.userId,
    p_livemode: input.livemode,
    p_reservation_id: input.reservationId,
    p_stripe_checkout_session_id: input.sessionId,
    p_stripe_checkout_session_url: input.sessionUrl,
  });
  if (error) throw new Error(`failed to store Stripe Checkout session: ${error.message}`);
  if (data !== true) throw new Error("Stripe Checkout reservation was lost before the session was stored");
}

export async function markCheckoutSession(
  sessionId: string,
  status: "completed" | "expired",
  reservationId?: string | null,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("mark_billing_checkout_session", {
    p_stripe_checkout_session_id: sessionId,
    p_status: status,
    p_reservation_id: reservationId ?? null,
  });
  if (error) throw new Error(`failed to mark Stripe Checkout ${status}: ${error.message}`);
  return data === true;
}

type CheckoutIntentRow = {
  status: "creating" | "ready" | "completed" | "expired";
  stripe_checkout_session_id: string | null;
};

export type CheckoutCancelDependencies = {
  findIntent: (input: {
    userId: string;
    livemode: boolean;
    reservationId: string;
  }) => Promise<CheckoutIntentRow | null>;
  retrieveSessionStatus: (sessionId: string) => Promise<"open" | "complete" | "expired" | null>;
  expireSession: (sessionId: string) => Promise<void>;
  markExpired: (sessionId: string, reservationId: string) => Promise<boolean>;
};

export type CheckoutCancelResult = "cancelled" | "completed" | "expired" | "missing";

export async function cancelCheckoutIntent(input: {
  userId: string;
  livemode: boolean;
  reservationId: string;
}): Promise<CheckoutCancelResult> {
  return cancelCheckoutIntentWithDeps(input, {
    findIntent: async ({ userId, livemode, reservationId }) => {
      const { data, error } = await supabaseAdmin()
        .from("billing_checkout_intents")
        .select("status,stripe_checkout_session_id")
        .eq("user_id", userId)
        .eq("livemode", livemode)
        .eq("reservation_id", reservationId)
        .maybeSingle<CheckoutIntentRow>();
      if (error) throw new Error(`failed to load Stripe Checkout reservation: ${error.message}`);
      return data;
    },
    retrieveSessionStatus: async (sessionId) => {
      const session = await billingStripe().checkout.sessions.retrieve(sessionId);
      return session.status;
    },
    expireSession: async (sessionId) => {
      await billingStripe().checkout.sessions.expire(sessionId);
    },
    markExpired: (sessionId, reservationId) => markCheckoutSession(
      sessionId,
      "expired",
      reservationId,
    ),
  });
}

export async function cancelCheckoutIntentWithDeps(
  input: {
    userId: string;
    livemode: boolean;
    reservationId: string;
  },
  dependencies: CheckoutCancelDependencies,
): Promise<CheckoutCancelResult> {
  if (!stripeCheckoutIdempotencyKey(input.reservationId)) return "missing";
  const intent = await dependencies.findIntent(input);
  if (!intent?.stripe_checkout_session_id) return "missing";
  if (intent.status === "completed") return "completed";
  if (intent.status === "expired") return "expired";

  const sessionId = intent.stripe_checkout_session_id;
  const status = await dependencies.retrieveSessionStatus(sessionId);
  if (status === "complete") return "completed";
  if (status === "open") await dependencies.expireSession(sessionId);
  if (status !== "open" && status !== "expired") {
    throw new Error("Stripe Checkout returned an invalid cancellation state");
  }

  if (!await dependencies.markExpired(sessionId, input.reservationId)) {
    throw new Error("Stripe Checkout reservation was not released after cancellation");
  }
  return status === "open" ? "cancelled" : "expired";
}
