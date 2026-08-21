// Server-only data + award layer for the gamification system. Reads/writes the
// Supabase tables (via the service-role admin client) and uses the pure logic in
// engine.ts. Never import this into a Client Component.

import type {
  AchievementItem,
  AchievementsView,
  LeaderRow,
  NavStats,
  Player,
  StreakDay,
} from "@/lib/gamification";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin";
import { effectivePlan, normalizeLegacyPlanCode, normalizePlanCode, type PlanCode } from "@/lib/auth/plans";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { drillAllowance } from "@/lib/auth/access-control";
import { billingLivemode } from "@/lib/billing/config";
import { PAID_ACCESS_STATUSES } from "@/lib/billing/policy";
import type { AnswerMap, ModuleVariant, SectionId } from "@/lib/sat/types";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  advanceStreak,
  dateKey,
  drillXpFor,
  levelProgress,
  mondayIndex,
  satisfiedAchievements,
  TEST_COMPLETE_XP,
  testBonusXp,
  weekStart,
  type Stats,
} from "./engine";

const SEASON = "Season 4 · Spring Sprint";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type HubState = {
  player: Player;
  weeklyStreak: StreakDay[];
  todayIndex: number;
  dailyGoal: { done: number; total: number };
  leaderboard: LeaderRow[];
  achievements: AchievementsView;
};

export type AwardOutcome = { xpAwarded: number; newAchievements: string[] };

type UserRow = {
  name: string | null;
  plan: string | null;
  xp: number;
  streak_current: number;
  streak_longest: number;
  last_active_date: string | null;
  daily_goal_target: number;
};

// Derive a friendly display name from a stored name (preferred) or the email.
function identity(email: string, name: string | null): {
  name: string;
  firstName: string;
  initials: string;
} {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    const initials = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
    return { name: name.trim(), firstName: parts[0], initials };
  }
  const local = email.split("@")[0] ?? email;
  const word = local.split(/[._-]/)[0] || local;
  const firstName = word.charAt(0).toUpperCase() + word.slice(1);
  return { name: firstName, firstName, initials: firstName.slice(0, 2).toUpperCase() };
}

async function loadUser(email: string): Promise<UserRow | null> {
  const { data } = await supabaseAdmin()
    .from("users")
    .select("name,plan,xp,streak_current,streak_longest,last_active_date,daily_goal_target")
    .eq("email", email)
    .maybeSingle<UserRow>();
  return data ?? null;
}

// Defensive read for the avatar URL, kept separate from loadUser so a missing
// avatar_url column (before supabase/auth.sql is re-run) can never break the
// gamification reads or the nav — it just falls back to null (initials shown).
async function loadAvatarUrl(email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("avatar_url")
    .eq("email", email)
    .maybeSingle<{ avatar_url: string | null }>();
  if (error) return null;
  return data?.avatar_url ?? null;
}

// Batch avatar lookup keyed by email, for surfaces that show many people at once
// (the leaderboard). Same defensive contract as loadAvatarUrl: any error (e.g. a
// missing avatar_url column) yields an empty map, so callers fall back to initials.
async function loadAvatarUrls(emails: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(emails)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("email,avatar_url")
    .in("email", unique)
    .returns<{ email: string; avatar_url: string | null }[]>();
  if (error || !data) return new Map();
  return new Map(data.map((r) => [r.email, r.avatar_url ?? null]));
}

// Assemble everything the hub needs for one student in a single call.
export async function getHubState(email: string): Promise<HubState> {
  const db = supabaseAdmin();
  const now = new Date();
  const today = dateKey(now);
  const weekStartDate = weekStart(now);
  const weekStartIso = weekStartDate.toISOString();

  const [user, access] = await Promise.all([loadUser(email), getStudentAccess(email)]);
  const xp = user?.xp ?? 0;
  const prog = levelProgress(xp);
  const id = identity(email, user?.name ?? null);

  // Per-day XP + goal completion for the current week (Mon..Sun). A day is "done"
  // (keeps the flame) when its drill count hits the goal or a test was finished.
  const dailyTarget = user?.daily_goal_target ?? 5;
  const dayIndex = (iso: string) => Math.floor((Date.parse(iso) - weekStartDate.getTime()) / 86_400_000);
  const perDayXp = Array<number>(7).fill(0);
  const perDayDrills = Array<number>(7).fill(0);
  const perDayTests = Array<number>(7).fill(0);

  const [weekEvents, weekDrills, weekTests, avatarUrl] = await Promise.all([
    db.from("xp_events").select("amount,created_at").eq("email", email).gte("created_at", weekStartIso).returns<{ amount: number; created_at: string }[]>(),
    db.from("drill_attempts").select("created_at").eq("email", email).gte("created_at", weekStartIso).returns<{ created_at: string }[]>(),
    db.from("test_attempts").select("created_at").eq("email", email).gte("created_at", weekStartIso).returns<{ created_at: string }[]>(),
    loadAvatarUrl(email),
  ]);
  for (const e of weekEvents.data ?? []) {
    const i = dayIndex(e.created_at);
    if (i >= 0 && i < 7 && e.amount > 0) perDayXp[i] += e.amount;
  }
  for (const r of weekDrills.data ?? []) {
    const i = dayIndex(r.created_at);
    if (i >= 0 && i < 7) perDayDrills[i] += 1;
  }
  for (const r of weekTests.data ?? []) {
    const i = dayIndex(r.created_at);
    if (i >= 0 && i < 7) perDayTests[i] += 1;
  }
  const weeklyStreak: StreakDay[] = WEEKDAYS.map((label, i) => ({
    label,
    xp: perDayXp[i],
    done: perDayDrills[i] >= dailyTarget || perDayTests[i] >= 1,
  }));

  // Daily goal: drills completed today.
  const { count: drillsToday } = await db
    .from("drill_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", `${today}T00:00:00Z`);

  // Weekly leaderboard.
  const { data: lbData } = await db.rpc("weekly_leaderboard", { p_since: weekStartIso });
  const rows = ((lbData ?? []) as { email: string; weekly_xp: number | string }[]).map((r) => ({
    email: r.email,
    weeklyXp: Number(r.weekly_xp),
  }));
  if (!rows.some((r) => r.email === email)) rows.push({ email, weeklyXp: 0 });
  rows.sort((a, b) => b.weeklyXp - a.weeklyXp);
  const myIndex = rows.findIndex((r) => r.email === email);
  const rival = myIndex > 0 ? rows[myIndex - 1] : null;
  // Load every ranked participant so the compact five-row card can expand into
  // the complete weekly board without another client-side request.
  const lbAvatars = await loadAvatarUrls(rows.map((r) => r.email));
  const leaderboard: LeaderRow[] = rows.map((r, i) => {
    const you = r.email === email;
    const who = identity(r.email, null);
    return {
      rank: i + 1,
      name: you ? "You" : who.name,
      xp: r.weeklyXp.toLocaleString(),
      initials: who.initials,
      avatarUrl: you ? avatarUrl : lbAvatars.get(r.email) ?? null,
      you,
    };
  });

  // Achievements: read persisted unlocks; the catalog supplies labels + descriptions.
  const { data: ua } = await db
    .from("user_achievements")
    .select("achievement_id")
    .eq("email", email)
    .returns<{ achievement_id: string }[]>();
  const unlocked = new Set((ua ?? []).map((r) => r.achievement_id));
  const achievementItems: AchievementItem[] = ACHIEVEMENTS.map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description,
    category: a.category,
    unlocked: unlocked.has(a.id),
  }));
  const achievementCategories = ACHIEVEMENT_CATEGORIES.map((c) => {
    const inCat = achievementItems.filter((i) => i.category === c.key);
    return {
      key: c.key,
      label: c.label,
      unlocked: inCat.filter((i) => i.unlocked).length,
      total: inCat.length,
    };
  });
  const nextUp = achievementItems.find((i) => !i.unlocked) ?? null;

  const player: Player = {
    name: id.name,
    firstName: id.firstName,
    initials: id.initials,
    avatarUrl,
    level: prog.level,
    xp,
    xpForNextLevel: prog.ceil,
    streak: user?.streak_current ?? 0,
    plan: access.plan,
    rank: myIndex + 1,
    season: SEASON,
    rivalName: rival ? identity(rival.email, null).firstName : "the top spot",
    xpBehindRival: rival ? Math.max(0, rival.weeklyXp - rows[myIndex].weeklyXp) : 0,
  };

  return {
    player,
    weeklyStreak,
    todayIndex: mondayIndex(now),
    dailyGoal: { done: drillsToday ?? 0, total: dailyTarget },
    leaderboard,
    achievements: {
      unlocked: unlocked.size,
      total: ACHIEVEMENTS.length,
      categories: achievementCategories,
      items: achievementItems,
      nextUp,
    },
  };
}

// Compute the full stat snapshot used to evaluate achievements.
async function computeStats(email: string, user: UserRow): Promise<Stats> {
  const db = supabaseAdmin();
  const [drills, tests, perfect, best, days] = await Promise.all([
    db.from("drill_attempts").select("id", { count: "exact", head: true }).eq("email", email),
    db.from("test_attempts").select("id", { count: "exact", head: true }).eq("email", email),
    db.from("drill_attempts").select("id", { count: "exact", head: true }).eq("email", email).eq("score", 100),
    db.from("test_attempts").select("total_score").eq("email", email).order("total_score", { ascending: false }).limit(1).maybeSingle<{ total_score: number | null }>(),
    db.from("drill_attempts").select("created_at").eq("email", email).returns<{ created_at: string }[]>(),
  ]);

  const byDay: Record<string, number> = {};
  for (const r of days.data ?? []) {
    const k = r.created_at.slice(0, 10);
    byDay[k] = (byDay[k] ?? 0) + 1;
  }
  const dailyGoalsHit = Object.values(byDay).filter((c) => c >= user.daily_goal_target).length;

  const prog = levelProgress(user.xp);
  return {
    xp: user.xp,
    level: prog.level,
    streakCurrent: user.streak_current,
    streakLongest: user.streak_longest,
    drillsCompleted: drills.count ?? 0,
    testsCompleted: tests.count ?? 0,
    dailyGoalsHit,
    bestTestScore: best.data?.total_score ?? 0,
    perfectDrills: perfect.count ?? 0,
  };
}

// Credit a streak DAY only once the daily goal is met (or a test is finished).
// Consistency keeps the flame — a single low-graded rep does not.
async function creditStreak(email: string): Promise<void> {
  const db = supabaseAdmin();
  const user = await loadUser(email);
  if (!user) return;
  const today = dateKey(new Date());
  if (user.last_active_date === today) return; // already credited today

  const startIso = `${today}T00:00:00Z`;
  const [drills, tests] = await Promise.all([
    db.from("drill_attempts").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", startIso),
    db.from("test_attempts").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", startIso),
  ]);
  const goalMet = (drills.count ?? 0) >= user.daily_goal_target || (tests.count ?? 0) >= 1;
  if (!goalMet) return;

  const res = advanceStreak(user.streak_current, user.streak_longest, user.last_active_date, today);
  await db
    .from("users")
    .update({ streak_current: res.streak, streak_longest: res.longest, last_active_date: today })
    .eq("email", email);
}

// Persist any achievements the current stats newly satisfy; return the new ids.
async function unlockNewAchievements(email: string): Promise<string[]> {
  const db = supabaseAdmin();
  const user = await loadUser(email);
  if (!user) return [];
  const stats = await computeStats(email, user);
  const satisfied = satisfiedAchievements(stats);
  const { data: existing } = await db
    .from("user_achievements")
    .select("achievement_id")
    .eq("email", email)
    .returns<{ achievement_id: string }[]>();
  const have = new Set((existing ?? []).map((r) => r.achievement_id));
  const newly = satisfied.filter((id) => !have.has(id));
  if (newly.length) {
    await db.from("user_achievements").insert(newly.map((achievement_id) => ({ email, achievement_id })));
  }
  return newly;
}

export type DrillResult = {
  drillSlug: string;
  correct?: number | null;
  total?: number | null;
  score?: number | null; // 0..100
};

// Record a completed drill, award XP, advance the streak, unlock achievements.
export async function awardDrill(email: string, result: DrillResult): Promise<AwardOutcome> {
  const allowance = await drillAllowance(email);
  if (!allowance.allowed) throw new Error("This drill is not included with the student's plan or the daily limit has been reached.");
  const db = supabaseAdmin();
  // Quality drives XP: the AI grade for graded drills, accuracy for objective ones.
  const quality =
    result.score ?? (result.total ? Math.round(((result.correct ?? 0) / result.total) * 100) : null);
  const amount = drillXpFor(result.drillSlug, quality);

  const { error: attemptError } = await db.from("drill_attempts").insert({
    email,
    drill_slug: result.drillSlug,
    correct: result.correct ?? null,
    total: result.total ?? null,
    score: quality,
    xp_awarded: amount,
  });
  if (attemptError) {
    throw new Error(`Could not save drill attempt [${attemptError.code}]: ${attemptError.message}`);
  }
  await db.from("xp_events").insert({ email, amount, reason: "drill", ref: result.drillSlug });
  await db.rpc("add_xp", { p_email: email, p_amount: amount });
  await creditStreak(email);
  const newAchievements = await unlockNewAchievements(email);
  return { xpAwarded: amount, newAchievements };
}

export type TestResultInput = {
  testSlug: string;
  totalScore: number;
  rwScore?: number;
  mathScore?: number;
  // Stored so the full report can be recomputed deterministically on review.
  answers?: AnswerMap;
  routed?: Partial<Record<SectionId, ModuleVariant>>;
  perQuestionTime?: Record<string, number>;
  // Idempotency: a unique per-finish token. A retried or duplicate submission with
  // the same token hits the unique index and is recorded once (no double award).
  clientToken?: string;
};

export type TestAwardOutcome = AwardOutcome & { attemptId: string };

// Record a completed practice test, award XP, advance the streak, unlock
// achievements. Idempotent on clientToken: a duplicate submission returns the
// existing attempt without awarding again. Returns the attempt id for linking.
export async function awardTest(email: string, input: TestResultInput): Promise<TestAwardOutcome> {
  const db = supabaseAdmin();
  const amount = TEST_COMPLETE_XP + testBonusXp(input.totalScore);

  const { data: inserted, error } = await db
    .from("test_attempts")
    .insert({
      email,
      test_slug: input.testSlug,
      total_score: input.totalScore,
      rw_score: input.rwScore ?? null,
      math_score: input.mathScore ?? null,
      xp_awarded: amount,
      answers: input.answers ?? null,
      routed: input.routed ?? null,
      per_question_time: input.perQuestionTime ?? null,
      completed_at: new Date().toISOString(),
      client_token: input.clientToken ?? null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  // A unique-token collision means this attempt was already recorded: return it
  // without awarding XP again. Anything else unexpected re-throws.
  if (error || !inserted) {
    if (input.clientToken) {
      const { data: existing } = await db
        .from("test_attempts")
        .select("id")
        .eq("client_token", input.clientToken)
        .maybeSingle<{ id: string }>();
      if (existing) return { xpAwarded: 0, newAchievements: [], attemptId: existing.id };
    }
    if (error) throw error;
  }

  await db.from("xp_events").insert({ email, amount, reason: "test", ref: input.testSlug });
  await db.rpc("add_xp", { p_email: email, p_amount: amount });
  await creditStreak(email);
  const newAchievements = await unlockNewAchievements(email);
  return { xpAwarded: amount, newAchievements, attemptId: inserted?.id ?? "" };
}

/* ------------------------------ Onboarding ------------------------------ */

export async function needsOnboarding(email: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("users")
    .select("onboarded_at")
    .eq("email", email)
    .maybeSingle<{ onboarded_at: string | null }>();
  return !data?.onboarded_at;
}

export async function markOnboarded(email: string): Promise<void> {
  await supabaseAdmin()
    .from("users")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("email", email);
}

/* ------------------------------ Test picker ----------------------------- */

export type TestProgress = {
  bestScore: number | null;
  testsDone: number;
  improvement: number | null; // best minus first
  bestBySlug: Record<string, number>;
  countBySlug: Record<string, number>;
};

export async function getTestProgress(email: string): Promise<TestProgress> {
  const { data } = await supabaseAdmin()
    .from("test_attempts")
    .select("test_slug,total_score,created_at")
    .eq("email", email)
    .order("created_at", { ascending: true })
    .returns<{ test_slug: string; total_score: number | null; created_at: string }[]>();

  const rows = data ?? [];
  const scores = rows.map((r) => r.total_score).filter((n): n is number => typeof n === "number");
  const bestScore = scores.length ? Math.max(...scores) : null;
  const firstScore = scores.length ? scores[0] : null;
  const bestBySlug: Record<string, number> = {};
  const countBySlug: Record<string, number> = {};
  for (const r of rows) {
    countBySlug[r.test_slug] = (countBySlug[r.test_slug] ?? 0) + 1;
    if (typeof r.total_score === "number") {
      bestBySlug[r.test_slug] = Math.max(bestBySlug[r.test_slug] ?? 0, r.total_score);
    }
  }
  return {
    bestScore,
    testsDone: rows.length,
    improvement: bestScore != null && firstScore != null ? bestScore - firstScore : null,
    bestBySlug,
    countBySlug,
  };
}

export type TestAttemptSummary = {
  id: string;
  totalScore: number | null;
  rwScore: number | null;
  mathScore: number | null;
  createdAt: string;
};

// All of a student's attempts at one test, newest first, for the attempts list.
export async function listTestAttempts(
  email: string,
  slug: string,
): Promise<TestAttemptSummary[]> {
  const { data } = await supabaseAdmin()
    .from("test_attempts")
    .select("id,total_score,rw_score,math_score,created_at")
    .eq("email", email)
    .eq("test_slug", slug)
    .order("created_at", { ascending: false })
    .returns<
      { id: string; total_score: number | null; rw_score: number | null; math_score: number | null; created_at: string }[]
    >();
  return (data ?? []).map((r) => ({
    id: r.id,
    totalScore: r.total_score,
    rwScore: r.rw_score,
    mathScore: r.math_score,
    createdAt: r.created_at,
  }));
}

export type CompletedTestAttempt = TestAttemptSummary & {
  testSlug: string;
};

// Every completed full-length test for the student, oldest first so score
// changes and the trend line use the student's actual testing sequence.
export async function listAllTestAttempts(email: string): Promise<CompletedTestAttempt[]> {
  const { data } = await supabaseAdmin()
    .from("test_attempts")
    .select("id,test_slug,total_score,rw_score,math_score,created_at,completed_at")
    .eq("email", email)
    .order("created_at", { ascending: true })
    .returns<
      {
        id: string;
        test_slug: string;
        total_score: number | null;
        rw_score: number | null;
        math_score: number | null;
        created_at: string;
        completed_at: string | null;
      }[]
    >();
  return (data ?? []).map((row) => ({
    id: row.id,
    testSlug: row.test_slug,
    totalScore: row.total_score,
    rwScore: row.rw_score,
    mathScore: row.math_score,
    createdAt: row.completed_at ?? row.created_at,
  }));
}

export type StoredTestAttempt = {
  id: string;
  testSlug: string;
  totalScore: number | null;
  rwScore: number | null;
  mathScore: number | null;
  answers: AnswerMap;
  routed: Partial<Record<SectionId, ModuleVariant>>;
  perQuestionTime: Record<string, number>;
  createdAt: string;
};

// One stored attempt, scoped to the owner (so a student can only open their own).
// Returns the data needed to recompute the full report via scoreTest.
export async function getTestAttempt(
  email: string,
  attemptId: string,
): Promise<StoredTestAttempt | null> {
  const { data } = await supabaseAdmin()
    .from("test_attempts")
    .select("id,test_slug,total_score,rw_score,math_score,answers,routed,per_question_time,created_at,completed_at")
    .eq("email", email)
    .eq("id", attemptId)
    .maybeSingle<{
      id: string;
      test_slug: string;
      total_score: number | null;
      rw_score: number | null;
      math_score: number | null;
      answers: AnswerMap | null;
      routed: Partial<Record<SectionId, ModuleVariant>> | null;
      per_question_time: Record<string, number> | null;
      created_at: string;
      completed_at: string | null;
    }>();
  if (!data) return null;
  return {
    id: data.id,
    testSlug: data.test_slug,
    totalScore: data.total_score,
    rwScore: data.rw_score,
    mathScore: data.math_score,
    answers: data.answers ?? {},
    routed: data.routed ?? {},
    perQuestionTime: data.per_question_time ?? {},
    createdAt: data.completed_at ?? data.created_at,
  };
}

/* ---------------------------------- Nav --------------------------------- */

// Lightweight stats for the shared top nav, without the full hub query.
export async function getNavStats(email: string): Promise<NavStats> {
  const [user, avatarUrl, access] = await Promise.all([loadUser(email), loadAvatarUrl(email), getStudentAccess(email)]);
  const xp = user?.xp ?? 0;
  const id = identity(email, user?.name ?? null);
  return {
    streak: user?.streak_current ?? 0,
    level: levelProgress(xp).level,
    xp,
    name: id.name,
    initials: id.initials,
    avatarUrl,
    plan: access.plan,
    isAdmin: isAdminEmail(email),
  };
}

/* ------------------------------ Admin roster ---------------------------- */

export type StudentDrillStat = { attempted: number; mastered: number };

export type StudentRow = {
  id: string;
  email: string;
  name: string;
  initials: string;
  plan: PlanCode;
  accountStatus: "active" | "suspended" | "archived";
  isTestAccount: boolean;
  level: number;
  xp: number;
  streak: number;
  lastActive: string | null;
  joined: string | null;
  onboarded: boolean;
  perDrill: Record<string, StudentDrillStat>;
  totalAttempted: number;
  totalMastered: number;
  bestTest: number | null;
  testsDone: number;
};

// Drills with per-question progress tracking (drill_question_progress).
const ROSTER_DRILLS = ["grammar", "reading", "targeted-math", "vocab"] as const;

// Full student roster for the admin panel: account + XP/streak + per-drill
// mastery + best practice-test score. Aggregates in JS from three bulk reads —
// fine at the current scale; swap to a Postgres view/RPC if the roster grows
// large. Sorted by XP, highest first.
export async function listStudents(): Promise<StudentRow[]> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const [usersRes, progRes, testRes, grantsRes, subscriptionsRes] = await Promise.all([
    db
      .from("users")
      .select("id,email,name,plan,account_status,is_test_account,xp,streak_current,last_login_at,last_active_date,created_at,onboarded_at")
      .returns<
        {
          id: string;
          email: string;
          name: string | null;
          plan: string | null;
          account_status: "active" | "suspended" | "archived";
          is_test_account: boolean;
          xp: number | null;
          streak_current: number | null;
          last_login_at: string | null;
          last_active_date: string | null;
          created_at: string | null;
          onboarded_at: string | null;
        }[]
      >(),
    db
      .from("drill_question_progress")
      .select("email,drill_slug,mastered_at")
      .returns<{ email: string; drill_slug: string; mastered_at: string | null }[]>(),
    db
      .from("test_attempts")
      .select("email,total_score")
      .returns<{ email: string; total_score: number | null }[]>(),
    db.from("access_grants").select("user_id,plan_code,created_at").is("revoked_at", null).lte("starts_at", now).or(`expires_at.is.null,expires_at.gt.${now}`).order("created_at", { ascending: false }).returns<{ user_id: string; plan_code: string; created_at: string }[]>(),
    db.from("student_subscriptions").select("user_id,plan_code,updated_at").eq("livemode", billingLivemode()).in("status", [...PAID_ACCESS_STATUSES]).order("updated_at", { ascending: false }).returns<{ user_id: string; plan_code: string; updated_at: string }[]>(),
  ]);

  const grantPlan = new Map<string, PlanCode>();
  for (const grant of grantsRes.data ?? []) if (!grantPlan.has(grant.user_id)) grantPlan.set(grant.user_id, normalizePlanCode(grant.plan_code));
  const subscriptionPlan = new Map<string, PlanCode>();
  for (const subscription of subscriptionsRes.data ?? []) if (!subscriptionPlan.has(subscription.user_id)) subscriptionPlan.set(subscription.user_id, normalizePlanCode(subscription.plan_code));

  // Per-drill mastery per student.
  const progByEmail = new Map<string, Record<string, StudentDrillStat>>();
  for (const r of progRes.data ?? []) {
    if (!(ROSTER_DRILLS as readonly string[]).includes(r.drill_slug)) continue;
    let perDrill = progByEmail.get(r.email);
    if (!perDrill) {
      perDrill = {};
      progByEmail.set(r.email, perDrill);
    }
    let stat = perDrill[r.drill_slug];
    if (!stat) {
      stat = { attempted: 0, mastered: 0 };
      perDrill[r.drill_slug] = stat;
    }
    stat.attempted += 1;
    if (r.mastered_at) stat.mastered += 1;
  }

  // Best + count of practice tests per student.
  const testByEmail = new Map<string, { best: number | null; count: number }>();
  for (const r of testRes.data ?? []) {
    const entry = testByEmail.get(r.email) ?? { best: null, count: 0 };
    entry.count += 1;
    if (typeof r.total_score === "number") {
      entry.best = entry.best == null ? r.total_score : Math.max(entry.best, r.total_score);
    }
    testByEmail.set(r.email, entry);
  }

  const rows: StudentRow[] = (usersRes.data ?? []).map((u) => {
    const xp = u.xp ?? 0;
    const id = identity(u.email, u.name);
    const perDrill = progByEmail.get(u.email) ?? {};
    let totalAttempted = 0;
    let totalMastered = 0;
    for (const slug of ROSTER_DRILLS) {
      const s = perDrill[slug];
      if (s) {
        totalAttempted += s.attempted;
        totalMastered += s.mastered;
      }
    }
    const test = testByEmail.get(u.email);
    return {
      id: u.id,
      email: u.email,
      name: id.name,
      initials: id.initials,
      plan: u.account_status === "active"
        ? effectivePlan(
            grantPlan.get(u.id) ?? null,
            subscriptionPlan.get(u.id) ?? null,
            normalizeLegacyPlanCode(u.plan),
          )
        : "free",
      accountStatus: u.account_status,
      isTestAccount: u.is_test_account,
      level: levelProgress(xp).level,
      xp,
      streak: u.streak_current ?? 0,
      lastActive: u.last_login_at ?? u.last_active_date ?? null,
      joined: u.created_at ?? null,
      onboarded: Boolean(u.onboarded_at),
      perDrill,
      totalAttempted,
      totalMastered,
      bestTest: test?.best ?? null,
      testsDone: test?.count ?? 0,
    };
  });

  rows.sort((a, b) => b.xp - a.xp);
  return rows;
}
