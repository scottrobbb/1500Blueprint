import "server-only";

import {
  getDrillUsageToday,
  getQuestionBankUsage,
  getStudentAccess,
} from "@/lib/auth/entitlements";
import { normalizePlanCode, type PlanCode, type StudentAccess } from "@/lib/auth/plans";
import { billingLivemode } from "@/lib/billing/config";
import { PAID_ACCESS_STATUSES, scheduledCancellationAt } from "@/lib/billing/policy";
import type { AchievementCategory } from "@/lib/gamification";
import { ACHIEVEMENTS, levelProgress, weekStart } from "@/lib/gamification/engine";
import { supabaseAdmin } from "@/utils/supabase/admin";

export type SettingsAccount = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  status: "active" | "suspended" | "archived";
  hasPasswordIdentity: boolean;
  hasStripeCustomer: boolean;
};

export type SettingsBillingSubscription = {
  plan: PlanCode;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancellationScheduledAt: string | null;
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

export type AccountAchievement = {
  id: string;
  label: string;
  category: AchievementCategory;
};

export type AccountSettingsData = {
  account: SettingsAccount | null;
  plan: PlanCode;
  level: number;
  weeklyRank: number | null;
  achievementCount: number;
  achievementTotal: number;
  achievements: AccountAchievement[];
  testDate: string | null;
};

type AccountRow = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_login_at: string | null;
  login_count: number;
  xp: number;
  streak_current: number;
  streak_longest: number;
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
  cancel_at: string | null;
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
      "id,email,name,avatar_url,created_at,last_login_at,login_count,xp,streak_current,streak_longest,account_status,auth_user_id,stripe_test_customer_id,stripe_live_customer_id",
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
    lastLoginAt: data.last_login_at,
    loginCount: data.login_count,
    xp: data.xp,
    currentStreak: data.streak_current,
    longestStreak: data.streak_longest,
    status: data.account_status,
    hasPasswordIdentity: Boolean(data.auth_user_id),
    hasStripeCustomer: Boolean(
      billingLivemode()
        ? data.stripe_live_customer_id
        : data.stripe_test_customer_id,
    ),
  };
}

type UnlockedAchievementRow = {
  achievement_id: string;
  unlocked_at: string;
};

type WeeklyXpRow = {
  email: string;
  weekly_xp: number | string;
};

export async function getAccountSettings(email: string): Promise<AccountSettingsData> {
  const normalizedEmail = email.trim().toLowerCase();
  const db = supabaseAdmin();
  const [account, access, optional] = await Promise.all([
    getSettingsAccount(normalizedEmail),
    getStudentAccess(normalizedEmail),
    Promise.allSettled([
      db
        .from("user_achievements")
        .select("achievement_id,unlocked_at", { count: "exact" })
        .eq("email", normalizedEmail)
        .order("unlocked_at", { ascending: false })
        .limit(6)
        .returns<UnlockedAchievementRow[]>(),
      db
        .from("study_planner_profiles")
        .select("test_date")
        .eq("email", normalizedEmail)
        .maybeSingle<{ test_date: string }>(),
      db.rpc("weekly_leaderboard", { p_since: weekStart(new Date()).toISOString() }),
    ]),
  ]);

  const [achievementResult, plannerResult, leaderboardResult] = optional;
  const achievementResponse = achievementResult.status === "fulfilled"
    ? achievementResult.value
    : null;
  const catalog = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));
  const achievements = (achievementResponse?.data ?? []).flatMap((row) => {
    const achievement = catalog.get(row.achievement_id);
    return achievement
      ? [{ id: achievement.id, label: achievement.label, category: achievement.category }]
      : [];
  });

  const leaderboardResponse = leaderboardResult.status === "fulfilled"
    ? leaderboardResult.value
    : null;
  const leaderboard = ((leaderboardResponse?.data ?? []) as WeeklyXpRow[]).map((row) => ({
    email: row.email.trim().toLowerCase(),
    xp: Number(row.weekly_xp),
  }));
  if (!leaderboard.some((row) => row.email === normalizedEmail)) {
    leaderboard.push({ email: normalizedEmail, xp: 0 });
  }
  leaderboard.sort((a, b) => b.xp - a.xp);
  const rankIndex = leaderboard.findIndex((row) => row.email === normalizedEmail);

  const plannerResponse = plannerResult.status === "fulfilled"
    ? plannerResult.value
    : null;
  const xp = account?.xp ?? 0;

  return {
    account,
    plan: access.plan,
    level: levelProgress(xp).level,
    weeklyRank: rankIndex >= 0 ? rankIndex + 1 : null,
    achievementCount: achievementResponse?.count ?? achievements.length,
    achievementTotal: ACHIEVEMENTS.length,
    achievements,
    testDate: plannerResponse?.data?.test_date ?? null,
  };
}

async function getSettingsBillingSubscription(
  accountId: string,
): Promise<SettingsBillingSubscription | null> {
  const { data, error } = await supabaseAdmin()
    .from("student_subscriptions")
    .select(
      "plan_code,status,current_period_start,current_period_end,cancel_at,cancel_at_period_end,pending_plan_code,pending_change_effective_at",
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
    cancellationScheduledAt: scheduledCancellationAt({
      cancelAt: data.cancel_at,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      currentPeriodEnd: data.current_period_end,
    }),
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
