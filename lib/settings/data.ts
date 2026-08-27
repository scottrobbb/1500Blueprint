import "server-only";

import {
  getDrillUsageToday,
  getQuestionBankUsage,
  getStudentAccess,
} from "@/lib/auth/entitlements";
import { normalizePlanCode, type PlanCode, type StudentAccess } from "@/lib/auth/plans";
import { billingLivemode } from "@/lib/billing/config";
import { PAID_ACCESS_STATUSES } from "@/lib/billing/policy";
import { supabaseAdmin } from "@/utils/supabase/admin";

export type SettingsAccount = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
  status: "active" | "suspended" | "archived";
  hasPasswordIdentity: boolean;
  hasStripeCustomer: boolean;
};

export type SettingsBillingSubscription = {
  plan: PlanCode;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: PlanCode | null;
  pendingChangeEffectiveAt: string | null;
};

export type SettingsAccessGrant = {
  plan: PlanCode;
  source: string;
  reason: string | null;
  expiresAt: string | null;
};

export type SubscriptionSettingsData = {
  access: StudentAccess;
  account: SettingsAccount | null;
  subscription: SettingsBillingSubscription | null;
  grant: SettingsAccessGrant | null;
  subscriptionUnavailable: boolean;
  grantUnavailable: boolean;
  questionBankUsed: number | null;
  drillsUsedToday: number | null;
};

type AccountRow = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  account_status: SettingsAccount["status"];
  auth_user_id: string | null;
  stripe_test_customer_id: string | null;
  stripe_live_customer_id: string | null;
};

type SubscriptionRow = {
  plan_code: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  pending_plan_code: string | null;
  pending_change_effective_at: string | null;
};

type GrantRow = {
  plan_code: string;
  source: string;
  reason: string | null;
  expires_at: string | null;
};

export async function getSettingsAccount(email: string): Promise<SettingsAccount | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select(
      "id,email,name,avatar_url,created_at,account_status,auth_user_id,stripe_test_customer_id,stripe_live_customer_id",
    )
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<AccountRow>();

  if (error) throw new Error(`failed to load settings account: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    avatarUrl: data.avatar_url,
    createdAt: data.created_at,
    status: data.account_status,
    hasPasswordIdentity: Boolean(data.auth_user_id),
    hasStripeCustomer: Boolean(
      billingLivemode()
        ? data.stripe_live_customer_id
        : data.stripe_test_customer_id,
    ),
  };
}

async function getSettingsBillingSubscription(
  accountId: string,
): Promise<SettingsBillingSubscription | null> {
  const { data, error } = await supabaseAdmin()
    .from("student_subscriptions")
    .select(
      "plan_code,status,current_period_start,current_period_end,cancel_at_period_end,pending_plan_code,pending_change_effective_at",
    )
    .eq("user_id", accountId)
    .eq("livemode", billingLivemode())
    .in("status", [...PAID_ACCESS_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  if (error) throw new Error(`failed to load settings subscription: ${error.message}`);
  if (!data) return null;

  return {
    plan: normalizePlanCode(data.plan_code),
    status: data.status,
    currentPeriodStart: data.current_period_start,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    pendingPlan: data.pending_plan_code
      ? normalizePlanCode(data.pending_plan_code)
      : null,
    pendingChangeEffectiveAt: data.pending_change_effective_at,
  };
}

async function getSettingsAccessGrant(accountId: string): Promise<SettingsAccessGrant | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from("access_grants")
    .select("plan_code,source,reason,expires_at")
    .eq("user_id", accountId)
    .is("revoked_at", null)
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<GrantRow>();

  if (error) throw new Error(`failed to load settings access grant: ${error.message}`);
  if (!data) return null;

  return {
    plan: normalizePlanCode(data.plan_code),
    source: data.source,
    reason: data.reason,
    expiresAt: data.expires_at,
  };
}

export async function getSubscriptionSettings(
  email: string,
): Promise<SubscriptionSettingsData> {
  const [access, account] = await Promise.all([
    getStudentAccess(email),
    getSettingsAccount(email),
  ]);

  const subscriptionPromise = account
    ? getSettingsBillingSubscription(account.id)
    : Promise.resolve(null);
  const grantPromise = account
    ? getSettingsAccessGrant(account.id)
    : Promise.resolve(null);
  const drillPromise =
    typeof access.entitlements.dailyDrillLimit === "number"
      ? getDrillUsageToday(email)
      : Promise.resolve(null);

  const [subscription, grant, questionBankUsage, drillUsage] =
    await Promise.allSettled([
      subscriptionPromise,
      grantPromise,
      getQuestionBankUsage(email),
      drillPromise,
    ]);

  return {
    access,
    account,
    subscription:
      subscription.status === "fulfilled" ? subscription.value : null,
    grant: grant.status === "fulfilled" ? grant.value : null,
    subscriptionUnavailable: subscription.status === "rejected",
    grantUnavailable: grant.status === "rejected",
    questionBankUsed:
      questionBankUsage.status === "fulfilled"
        ? questionBankUsage.value
        : null,
    drillsUsedToday:
      drillUsage.status === "fulfilled" ? drillUsage.value : null,
  };
}
