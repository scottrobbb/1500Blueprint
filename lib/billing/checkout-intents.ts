import "server-only";

import type { BillablePlan } from "./config";
import type { BillingCadence } from "./offers";
import {
  parseCheckoutIntentClaim,
  type CheckoutIntentClaim,
} from "./workflow";
import { supabaseAdmin } from "@/utils/supabase/admin";

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
