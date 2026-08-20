import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import {
  accessForPlan,
  normalizePlanCode,
  type StudentAccess,
} from "./plans";

export type { AccessSource, PlanCode, PlanEntitlements, StudentAccess } from "./plans";
export { accessForPlan, normalizePlanCode, PLAN_ENTITLEMENTS } from "./plans";

type AccountRow = {
  id: string;
  plan: string | null;
  account_status: "active" | "suspended" | "archived";
};

type PlanRow = { plan_code: string };

export async function getStudentAccess(email: string): Promise<StudentAccess> {
  const admin = supabaseAdmin();
  const { data: account, error: accountError } = await admin
    .from("users")
    .select("id,plan,account_status")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<AccountRow>();

  if (accountError) throw new Error(`failed to load student access: ${accountError.message}`);
  if (!account) return accessForPlan("free", "free", null);
  if (account.account_status !== "active") {
    return accessForPlan("free", "free", account.id, false);
  }

  const now = new Date().toISOString();
  const [{ data: grant, error: grantError }, { data: subscription, error: subscriptionError }] =
    await Promise.all([
      admin
        .from("access_grants")
        .select("plan_code")
        .eq("user_id", account.id)
        .is("revoked_at", null)
        .lte("starts_at", now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<PlanRow>(),
      admin
        .from("student_subscriptions")
        .select("plan_code")
        .eq("user_id", account.id)
        .in("status", ["active", "trialing"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<PlanRow>(),
    ]);

  if (grantError) throw new Error(`failed to load access grant: ${grantError.message}`);
  if (subscriptionError) {
    throw new Error(`failed to load student subscription: ${subscriptionError.message}`);
  }

  if (grant) return accessForPlan(normalizePlanCode(grant.plan_code), "grant", account.id);
  if (subscription) {
    return accessForPlan(normalizePlanCode(subscription.plan_code), "subscription", account.id);
  }
  if (account.plan) {
    return accessForPlan(normalizePlanCode(account.plan), "legacy", account.id);
  }
  return accessForPlan("free", "free", account.id);
}
