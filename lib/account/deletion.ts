import "server-only";

import { PAID_ACCESS_STATUSES } from "@/lib/billing/policy";
import { billingStripe } from "@/lib/billing/stripe";
import { reportServerError, reportServerEvent } from "@/lib/observability/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { ANONYMIZED_NAME, anonymizedEmail, ERASED_TABLES, isAnonymizedEmail } from "./deletion-plan";

export type DeletionOutcome =
  | { ok: true; cancelledSubscriptions: number }
  | { ok: false; reason: "not_found" | "stripe_cancel_failed" | "erase_failed" };

type UserRow = { id: string; email: string; auth_user_id: string | null };
type SubscriptionRow = { stripe_subscription_id: string; status: string };

// Cancels the paid subscription and then empties the account.
//
// Stripe goes first and a failure there stops everything: a deleted account we
// are still billing is the one outcome that costs the student money, while a
// cancelled subscription on an account that failed to erase is recoverable by
// running this again. Nothing here is a transaction, so the order is the
// safety, and every step is written to be safe to repeat.
export async function deleteStudentAccount(email: string): Promise<DeletionOutcome> {
  const db = supabaseAdmin();
  const normalized = email.trim().toLowerCase();

  const { data: user, error: userError } = await db
    .from("users")
    .select("id,email,auth_user_id")
    .eq("email", normalized)
    .maybeSingle<UserRow>();
  if (userError) {
    reportServerError("account.delete.user_lookup_failed", userError, { provider: "supabase" });
    return { ok: false, reason: "erase_failed" };
  }
  if (!user || isAnonymizedEmail(user.email)) return { ok: false, reason: "not_found" };

  const cancelled = await cancelPaidSubscriptions(user.id);
  if (cancelled === null) return { ok: false, reason: "stripe_cancel_failed" };

  for (const { table, column } of ERASED_TABLES) {
    const owner = column === "user_id" ? user.id : normalized;
    const { error } = await db.from(table).delete().eq(column, owner);
    // A table that does not exist in this environment is not a reason to leave
    // the rest of the account in place; anything else is.
    if (error && error.code !== "42P01") {
      reportServerError("account.delete.erase_failed", error, { provider: "supabase", source: `${table}.${column}` });
      return { ok: false, reason: "erase_failed" };
    }
  }

  // Last, because the rows above reference this email and most of those keys
  // do not cascade on update.
  const { error: anonymizeError } = await db
    .from("users")
    .update({
      email: anonymizedEmail(user.id),
      name: ANONYMIZED_NAME,
      avatar_url: null,
      account_status: "archived",
      plan: null,
    })
    .eq("id", user.id);
  if (anonymizeError) {
    reportServerError("account.delete.anonymize_failed", anonymizeError, { provider: "supabase" });
    return { ok: false, reason: "erase_failed" };
  }

  // The sign-in itself. Without this the address could still authenticate and
  // land on an account that no longer matches it.
  if (user.auth_user_id) {
    try {
      const { error } = await db.auth.admin.deleteUser(user.auth_user_id);
      if (error) throw error;
    } catch (error) {
      // The account is already anonymized and emptied at this point, so the
      // deletion stands; a stranded auth user cannot reach it.
      reportServerError("account.delete.auth_user_delete_failed", error, { provider: "supabase" });
    }
  }

  reportServerEvent("account.delete.completed", { reason: `cancelled_subscriptions=${cancelled}` });
  return { ok: true, cancelledSubscriptions: cancelled };
}

// Returns how many subscriptions were cancelled, or null if Stripe refused.
async function cancelPaidSubscriptions(userId: string): Promise<number | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("student_subscriptions")
    .select("stripe_subscription_id,status")
    .eq("user_id", userId)
    .in("status", [...PAID_ACCESS_STATUSES])
    .overrideTypes<SubscriptionRow[], { merge: false }>();
  if (error) {
    reportServerError("account.delete.subscription_lookup_failed", error, { provider: "supabase" });
    return null;
  }
  if (!data || data.length === 0) return 0;

  let cancelled = 0;
  for (const subscription of data) {
    try {
      await billingStripe().subscriptions.cancel(subscription.stripe_subscription_id);
      cancelled += 1;
    } catch (error) {
      // Stripe reports an already-cancelled or unknown subscription as
      // resource_missing. There is nothing left to bill, so it counts as done.
      if ((error as { code?: string })?.code === "resource_missing") {
        cancelled += 1;
        continue;
      }
      reportServerError("account.delete.stripe_cancel_failed", error, {
        provider: "stripe",
        source: subscription.stripe_subscription_id,
      });
      return null;
    }
    const { error: statusError } = await db
      .from("student_subscriptions")
      .update({ status: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", subscription.stripe_subscription_id);
    if (statusError) {
      // Stripe is the source of truth and its webhook will correct this row,
      // so a stale status here does not undo the cancellation.
      reportServerError("account.delete.subscription_status_stale", statusError, { provider: "supabase" });
    }
  }
  return cancelled;
}
