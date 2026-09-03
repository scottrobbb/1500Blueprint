import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import { clearPendingChange, releaseSchedule } from "./changes";
import { billingLivemode, retentionCouponId } from "./config";
import { PAID_ACCESS_STATUSES } from "./policy";
import { billingStripe } from "./stripe";
import { stripeSubscriptionCadence, syncStripeSubscription } from "./subscriptions";
import {
  acceptRetentionOfferWithDeps,
  cancelSubscriptionWithDeps,
  resumeSubscriptionWithDeps,
  type CancellationResult,
  type RetentionAcceptResult,
  type RetentionClaim,
  type RetentionDeps,
  type RetentionSubscriptionRow,
  type ResumeResult,
} from "./retention-orchestrator";

export {
  BillingRetentionError,
  type CancellationResult,
  type RetentionAcceptResult,
  type ResumeResult,
} from "./retention-orchestrator";

// 40% off, duration `once`, so it lands on exactly the next renewal and then
// falls off by itself. It applies to Core and Max on both monthly and 3-month
// billing, which is why no per-plan mapping is needed here. The id itself is
// mode-scoped and resolved per environment; see retentionCouponId.
export const RETENTION_PERCENT_OFF = 40;

export async function cancelSubscriptionForUser(userId: string): Promise<CancellationResult> {
  return cancelSubscriptionWithDeps(retentionDeps(), userId);
}

export async function acceptRetentionOfferForUser(userId: string): Promise<RetentionAcceptResult> {
  return acceptRetentionOfferWithDeps(retentionDeps(), userId);
}

export async function resumeSubscriptionForUser(userId: string): Promise<ResumeResult> {
  return resumeSubscriptionWithDeps(retentionDeps(), userId);
}

function retentionDeps(): RetentionDeps {
  const livemode = billingLivemode();
  return {
    livemode,
    couponId: retentionCouponId(livemode),
    percentOff: RETENTION_PERCENT_OFF,
    activeSubscription: activeSubscriptionForUser,
    claimOffer: claimRetentionOffer,
    releaseAcceptance: releaseRetentionOfferAcceptance,
    // Discounts arrive as bare ids unless they are expanded, and the duplicate
    // guard reads them, so every retrieve on this path expands them.
    retrieveSubscription: (id) => billingStripe().subscriptions.retrieve(id, {
      expand: ["discounts"],
    }),
    cadenceForSubscription: stripeSubscriptionCadence,
    releaseSchedule,
    clearPending: clearPendingChange,
    updateSubscription: (id, params, idempotencyKey) => billingStripe().subscriptions.update(
      id,
      params,
      idempotencyKey ? { idempotencyKey } : undefined,
    ),
    syncSubscription: (subscription, ownerId) => syncStripeSubscription(subscription, ownerId),
  };
}

async function activeSubscriptionForUser(
  userId: string,
  livemode: boolean,
): Promise<RetentionSubscriptionRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("student_subscriptions")
    .select(
      "stripe_subscription_id,stripe_customer_id,status,current_period_end,cancel_at,cancel_at_period_end,pending_plan_code,stripe_schedule_id",
    )
    .eq("user_id", userId)
    .eq("livemode", livemode)
    .in("status", [...PAID_ACCESS_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<RetentionSubscriptionRow>();
  if (error) throw new Error(`failed to load active subscription: ${error.message}`);
  return data ?? null;
}

type ClaimRow = {
  decision: string;
  shown_at: string | null;
  accepted_at: string | null;
};

// The eligibility gate. It lives in Postgres behind a row lock so that two
// requests racing each other cannot both be told the offer is theirs.
async function claimRetentionOffer(
  userId: string,
  action: "show" | "accept",
): Promise<RetentionClaim> {
  const { data, error } = await supabaseAdmin()
    .rpc("claim_retention_offer", { p_user_id: userId, p_action: action })
    .returns<ClaimRow[]>();
  if (error) throw new Error(`failed to claim the retention offer: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : (data as ClaimRow | null);
  if (!row) throw new Error("The retention offer claim returned no decision");
  if (
    row.decision !== "granted"
    && row.decision !== "already_shown"
    && row.decision !== "already_accepted"
    && row.decision !== "not_offered"
  ) {
    throw new Error(`The retention offer claim returned an unknown decision: ${row.decision}`);
  }
  return { decision: row.decision, shownAt: row.shown_at, acceptedAt: row.accepted_at };
}

async function releaseRetentionOfferAcceptance(userId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .rpc("release_retention_offer_acceptance", { p_user_id: userId });
  if (error) throw new Error(`failed to release the retention offer claim: ${error.message}`);
}
