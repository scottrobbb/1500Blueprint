import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import {
  accessForPlan,
  accessForTestPersona,
  effectivePlan,
  hasCourseAccess,
  normalizeLegacyPlanCode,
  normalizePlanCode,
  type StudentAccess,
} from "./plans";
import { billingLivemode } from "@/lib/billing/config";
import { PAID_ACCESS_STATUSES } from "@/lib/billing/policy";

export type { AccessSource, PlanCode, PlanEntitlements, StudentAccess } from "./plans";
export { accessForPlan, normalizeLegacyPlanCode, normalizePlanCode, PLAN_ENTITLEMENTS } from "./plans";

type AccountRow = {
  id: string;
  plan: string | null;
  account_status: "active" | "suspended" | "archived";
  is_test_account: boolean;
  test_persona: string | null;
};

type PlanRow = { plan_code: string };

export async function getStudentAccess(email: string): Promise<StudentAccess> {
  const admin = supabaseAdmin();
  const { data: account, error: accountError } = await admin
    .from("users")
    .select("id,plan,account_status,is_test_account,test_persona")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<AccountRow>();

  if (accountError) throw new Error(`failed to load student access: ${accountError.message}`);
  if (!account) return accessForPlan("free", "free", null);
  if (account.is_test_account) {
    const personaAccess = accessForTestPersona(account.test_persona, account.id);
    if (personaAccess) return personaAccess;
  }
  if (account.account_status !== "active") {
    return accessForPlan("free", "free", account.id, false, account.account_status, account.is_test_account);
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
        .eq("livemode", billingLivemode())
        .in("status", [...PAID_ACCESS_STATUSES])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<PlanRow>(),
    ]);

  if (grantError) throw new Error(`failed to load access grant: ${grantError.message}`);
  if (subscriptionError) {
    throw new Error(`failed to load student subscription: ${subscriptionError.message}`);
  }

  const grantPlan = grant ? normalizePlanCode(grant.plan_code) : "free";
  const subscriptionPlan = subscription ? normalizePlanCode(subscription.plan_code) : "free";
  const legacyPlan = account.plan ? normalizeLegacyPlanCode(account.plan) : "free";
  const plan = effectivePlan(grant ? grantPlan : null, subscription ? subscriptionPlan : null, legacyPlan);
  const source = plan === subscriptionPlan && subscription ? "subscription"
    : plan === grantPlan && grant ? "grant"
    : plan === legacyPlan && account.plan ? "legacy"
    : "free";
  return accessForPlan(plan, source, account.id, true, "active", account.is_test_account);
}

export async function getQuestionBankUsage(email: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("question_bank_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase());
  if (error) throw new Error(`failed to load question bank usage: ${error.message}`);
  return count ?? 0;
}

export async function getDrillUsageToday(email: string): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { count, error } = await supabaseAdmin()
    .from("drill_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase())
    .gte("created_at", start);
  if (error) throw new Error(`failed to load daily drill usage: ${error.message}`);
  return count ?? 0;
}

export function canAccessCourse(plan: StudentAccess, courseSlug: string): boolean {
  return hasCourseAccess(plan.entitlements, courseSlug);
}
