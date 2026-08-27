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
import { hasStaffRole } from "@/lib/auth/staff";
import { effectivePlan, normalizeLegacyPlanCode, normalizePlanCode, type AccessSource, type PlanCode } from "@/lib/auth/plans";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { drillAllowance } from "@/lib/auth/access-control";
import { billingLivemode } from "@/lib/billing/config";
import { PAID_ACCESS_STATUSES } from "@/lib/billing/policy";
import { isComplimentaryAccount } from "@/lib/auth/complimentary";
import type { AnswerMap, ModuleVariant, PracticeTest, SectionId } from "@/lib/sat/types";
import { parsePracticeTestSnapshot } from "@/lib/sat/testSnapshot";
import { isMissingTestSnapshotColumnError } from "@/lib/progress/database";
import { summarizeTestScores } from "@/lib/progress/summary";
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

export type HomePlayer = Pick<
  Player,
  "name" | "initials" | "avatarUrl" | "level" | "xp" | "xpForNextLevel" | "streak" | "plan"
> & { firstName: string | null };

export type HomeState = {
  player: HomePlayer;
  dailyGoal: { done: number; total: number };
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

async function loadAchievements(email: string): Promise<AchievementsView> {
  const { data } = await supabaseAdmin()
    .from("user_achievements")
    .select("achievement_id")
    .eq("email", email)
    .returns<{ achievement_id: string }[]>();
  const unlocked = new Set((data ?? []).map((row) => row.achievement_id));
  const items: AchievementItem[] = ACHIEVEMENTS.map((achievement) => ({
    id: achievement.id,
    label: achievement.label,
    description: achievement.description,
    category: achievement.category,
    unlocked: unlocked.has(achievement.id),
  }));
  const categories = ACHIEVEMENT_CATEGORIES.map((category) => {
    const categoryItems = items.filter((item) => item.category === category.key);
    return {
      key: category.key,
      label: category.label,
      unlocked: categoryItems.filter((item) => item.unlocked).length,
      total: categoryItems.length,
    };
  });

  return {
    unlocked: unlocked.size,
    total: ACHIEVEMENTS.length,
    categories,
    items,
    nextUp: items.find((item) => !item.unlocked) ?? null,
  };
}

// The home page only needs the student's identity, navigation stats, and
// compact daily count. Keep this separate from getHubState so the home never pays for
// achievements, weekly summaries, rival calculations, or leaderboard avatars.
export async function getHomeState(email: string): Promise<HomeState> {
  const today = dateKey(new Date());
  const db = supabaseAdmin();
  const [user, avatarUrl, access, drillsToday] = await Promise.all([
    loadUser(email),
    loadAvatarUrl(email),
    getStudentAccess(email),
    db
      .from("drill_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", `${today}T00:00:00Z`),
  ]);
  const xp = user?.xp ?? 0;
  const progress = levelProgress(xp);
  const id = identity(email, user?.name ?? null);

  return {
    player: {
      name: id.name,
      firstName: user?.name?.trim() ? user.name.trim().split(/\s+/)[0] : null,
      initials: id.initials,
      avatarUrl,
      level: progress.level,
      xp,
      xpForNextLevel: progress.ceil,
      streak: user?.streak_current ?? 0,
      plan: access.plan,
    },
    dailyGoal: {
      done: drillsToday.count ?? 0,
      total: user?.daily_goal_target ?? 5,
    },
  };
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
  const achievements = await loadAchievements(email);

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
    achievements,
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
  clientToken?: string | null;
};

// Record a completed drill, award XP, advance the streak, unlock achievements.
export async function awardDrill(email: string, result: DrillResult): Promise<AwardOutcome> {
  const db = supabaseAdmin();
  if (result.clientToken) {
    const duplicate = await db
      .from("drill_attempts")
      .select("id")
      .eq("email", email)
      .eq("client_token", result.clientToken)
      .maybeSingle<{ id: string }>();
    if (duplicate.error) {
      throw new Error(`Could not verify drill attempt [${duplicate.error.code}]: ${duplicate.error.message}`);
    }
    if (duplicate.data) return { xpAwarded: 0, newAchievements: [] };
  }
  const allowance = await drillAllowance(email);
  if (!allowance.allowed) throw new Error("This drill is not included with the student's plan or the daily limit has been reached.");
  // Quality drives XP: the AI grade for graded drills, accuracy for objective ones.
  const quality =
    result.score ?? (result.total ? Math.round(((result.correct ?? 0) / result.total) * 100) : null);
  const amount = drillXpFor(result.drillSlug, quality);

  const attemptRow: {
    email: string;
    drill_slug: string;
    correct: number | null;
    total: number | null;
    score: number | null;
    xp_awarded: number;
    client_token?: string;
  } = {
    email,
    drill_slug: result.drillSlug,
    correct: result.correct ?? null,
    total: result.total ?? null,
    score: quality,
    xp_awarded: amount,
  };
  if (result.clientToken) attemptRow.client_token = result.clientToken;
  const { error: attemptError } = await db.from("drill_attempts").insert(attemptRow);
  if (attemptError) {
    if (attemptError.code === "23505" && result.clientToken) {
      const duplicate = await db
        .from("drill_attempts")
        .select("id")
        .eq("email", email)
        .eq("client_token", result.clientToken)
        .maybeSingle<{ id: string }>();
      if (duplicate.error) {
        throw new Error(`Could not verify drill attempt [${duplicate.error.code}]: ${duplicate.error.message}`);
      }
      if (duplicate.data) return { xpAwarded: 0, newAchievements: [] };
    }
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
  // Freeze the exact form so later CMS edits cannot rewrite a finished report.
  testSnapshot?: PracticeTest;
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
  const attemptRow = {
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
  };
  let insertion = await db
    .from("test_attempts")
    .insert({
      ...attemptRow,
      test_snapshot: input.testSnapshot ?? null,
      test_title: input.testSnapshot?.title ?? null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (isMissingTestSnapshotColumnError(insertion.error)) {
    insertion = await db
      .from("test_attempts")
      .insert(attemptRow)
      .select("id")
      .maybeSingle<{ id: string }>();
  }
  const { data: inserted, error } = insertion;

  // A unique-token collision means this attempt was already recorded: return it
  // without awarding XP again. Anything else unexpected re-throws.
  if (error || !inserted) {
    if (input.clientToken) {
      const { data: existing } = await db
        .from("test_attempts")
        .select("id")
        .eq("email", email)
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
  latestScore: number | null;
  testsDone: number;
  improvement: number | null; // latest minus first, once two scores exist
  bestBySlug: Record<string, number>;
  countBySlug: Record<string, number>;
};

export async function getTestProgress(email: string): Promise<TestProgress> {
  const rows: { test_slug: string; total_score: number | null; created_at: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin()
      .from("test_attempts")
      .select("test_slug,total_score,created_at")
      .eq("email", email)
      .order("created_at", { ascending: true })
      .range(offset, offset + 999)
      .returns<{ test_slug: string; total_score: number | null; created_at: string }[]>();
    if (error) throw new Error(`Could not load test progress [${error.code}]: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  return summarizeTestScores(rows.map((row) => ({
    testSlug: row.test_slug,
    totalScore: row.total_score,
    createdAt: row.created_at,
  })));
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
  const { data, error } = await supabaseAdmin()
    .from("test_attempts")
    .select("id,total_score,rw_score,math_score,created_at")
    .eq("email", email)
    .eq("test_slug", slug)
    .order("created_at", { ascending: false })
    .returns<
      { id: string; total_score: number | null; rw_score: number | null; math_score: number | null; created_at: string }[]
    >();
  if (error) throw new Error(`Could not load test attempts [${error.code}]: ${error.message}`);
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
  testTitle?: string | null;
};

type CompletedTestRow = {
  id: string;
  test_slug: string;
  total_score: number | null;
  rw_score: number | null;
  math_score: number | null;
  created_at: string;
  completed_at: string | null;
  test_title: string | null;
};

// Every completed full-length test for the student, oldest first so score
// changes and the trend line use the student's actual testing sequence.
export async function listAllTestAttempts(email: string): Promise<CompletedTestAttempt[]> {
  const db = supabaseAdmin();
  const current = await db
    .from("test_attempts")
    .select("id,test_slug,total_score,rw_score,math_score,created_at,completed_at,test_title")
    .eq("email", email)
    .order("created_at", { ascending: true })
    .returns<CompletedTestRow[]>();
  let rows = current.data ?? [];
  if (current.error) {
    if (!isMissingTestSnapshotColumnError(current.error)) {
      throw new Error(`Could not load completed tests [${current.error.code}]: ${current.error.message}`);
    }
    const legacy = await db
      .from("test_attempts")
      .select("id,test_slug,total_score,rw_score,math_score,created_at,completed_at")
      .eq("email", email)
      .order("created_at", { ascending: true })
      .returns<Omit<CompletedTestRow, "test_title">[]>();
    if (legacy.error) throw new Error(`Could not load completed tests [${legacy.error.code}]: ${legacy.error.message}`);
    rows = (legacy.data ?? []).map((row) => ({ ...row, test_title: null }));
  }
  return rows.map((row) => ({
    id: row.id,
    testSlug: row.test_slug,
    testTitle: row.test_title,
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
  testSnapshot: PracticeTest | null;
  createdAt: string;
};

type StoredTestAttemptRow = {
  id: string;
  test_slug: string;
  total_score: number | null;
  rw_score: number | null;
  math_score: number | null;
  answers: AnswerMap | null;
  routed: Partial<Record<SectionId, ModuleVariant>> | null;
  per_question_time: Record<string, number> | null;
  test_snapshot: unknown;
  created_at: string;
  completed_at: string | null;
};

// One stored attempt, scoped to the owner (so a student can only open their own).
// Returns the data needed to recompute the full report via scoreTest.
export async function getTestAttempt(
  email: string,
  attemptId: string,
): Promise<StoredTestAttempt | null> {
  const db = supabaseAdmin();
  const current = await db
    .from("test_attempts")
    .select("id,test_slug,total_score,rw_score,math_score,answers,routed,per_question_time,test_snapshot,created_at,completed_at")
    .eq("email", email)
    .eq("id", attemptId)
    .maybeSingle<StoredTestAttemptRow>();
  let data = current.data;
  if (current.error) {
    if (!isMissingTestSnapshotColumnError(current.error)) {
      throw new Error(`Could not load completed test [${current.error.code}]: ${current.error.message}`);
    }
    const legacy = await db
      .from("test_attempts")
      .select("id,test_slug,total_score,rw_score,math_score,answers,routed,per_question_time,created_at,completed_at")
      .eq("email", email)
      .eq("id", attemptId)
      .maybeSingle<Omit<StoredTestAttemptRow, "test_snapshot">>();
    if (legacy.error) throw new Error(`Could not load completed test [${legacy.error.code}]: ${legacy.error.message}`);
    data = legacy.data ? { ...legacy.data, test_snapshot: null } : null;
  }
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
    testSnapshot: parsePracticeTestSnapshot(data.test_snapshot),
    createdAt: data.completed_at ?? data.created_at,
  };
}

/* ---------------------------------- Nav --------------------------------- */

// Lightweight stats for the shared top nav, without the full hub query.
export async function getNavStats(email: string): Promise<NavStats> {
  const [user, avatarUrl, access, isExplanationEditor] = await Promise.all([
    loadUser(email),
    loadAvatarUrl(email),
    getStudentAccess(email),
    hasStaffRole(email, "explanation_editor"),
  ]);
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
    isExplanationEditor,
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
  accessSource: AccessSource;
  legacyPlan: PlanCode;
  subscriptionPlan: PlanCode | null;
  subscriptionStatus: string | null;
  subscriptionPeriodStart: string | null;
  subscriptionPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: PlanCode | null;
  pendingChangeEffectiveAt: string | null;
  grantPlan: PlanCode | null;
  grantSource: string | null;
  grantExpiresAt: string | null;
  isComplimentary: boolean;
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

const ROSTER_PAGE_SIZE = 1000;

type RosterPage<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function loadRosterPages<T>(
  label: string,
  loadPage: (from: number, to: number) => PromiseLike<RosterPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += ROSTER_PAGE_SIZE) {
    const result = await loadPage(from, from + ROSTER_PAGE_SIZE - 1);
    if (result.error) throw new Error(`Could not load ${label}: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < ROSTER_PAGE_SIZE) return rows;
  }
}

type RosterUser = {
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
};

type RosterProgress = {
  email: string;
  question_id: string;
  drill_slug: string;
  mastered_at: string | null;
};

type RosterTestAttempt = { id: string; email: string; total_score: number | null };

type RosterGrant = {
  id: string;
  user_id: string;
  plan_code: string;
  source: string;
  expires_at: string | null;
  created_at: string;
};

type RosterSubscription = {
  id: string;
  user_id: string;
  plan_code: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  pending_plan_code: string | null;
  pending_change_effective_at: string | null;
  updated_at: string;
};

// Full student roster for the admin panel: account + XP/streak + per-drill
// mastery + best practice-test score. Aggregates in JS from three bulk reads —
// fine at the current scale; swap to a Postgres view/RPC if the roster grows
// large. Sorted by XP, highest first.
export async function listStudents(): Promise<StudentRow[]> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const [users, progress, testAttempts, grants, subscriptions] = await Promise.all([
    loadRosterPages<RosterUser>("students", (from, to) => db
      .from("users")
      .select("id,email,name,plan,account_status,is_test_account,xp,streak_current,last_login_at,last_active_date,created_at,onboarded_at")
      .order("id")
      .range(from, to)
      .returns<RosterUser[]>()),
    loadRosterPages<RosterProgress>("student drill progress", (from, to) => db
      .from("drill_question_progress")
      .select("email,question_id,drill_slug,mastered_at")
      .order("email")
      .order("question_id")
      .range(from, to)
      .returns<RosterProgress[]>()),
    loadRosterPages<RosterTestAttempt>("student test attempts", (from, to) => db
      .from("test_attempts")
      .select("id,email,total_score")
      .order("id")
      .range(from, to)
      .returns<RosterTestAttempt[]>()),
    loadRosterPages<RosterGrant>("student access grants", (from, to) => db
      .from("access_grants")
      .select("id,user_id,plan_code,source,expires_at,created_at")
      .is("revoked_at", null)
      .lte("starts_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<RosterGrant[]>()),
    loadRosterPages<RosterSubscription>("student subscriptions", (from, to) => db
      .from("student_subscriptions")
      .select("id,user_id,plan_code,status,current_period_start,current_period_end,cancel_at_period_end,pending_plan_code,pending_change_effective_at,updated_at")
      .eq("livemode", billingLivemode())
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<RosterSubscription[]>()),
  ]);

  const grantByUser = new Map<string, RosterGrant>();
  for (const grant of grants) if (!grantByUser.has(grant.user_id)) grantByUser.set(grant.user_id, grant);
  const latestSubscriptionByUser = new Map<string, RosterSubscription>();
  const paidSubscriptionByUser = new Map<string, RosterSubscription>();
  for (const subscription of subscriptions) {
    if (!latestSubscriptionByUser.has(subscription.user_id)) {
      latestSubscriptionByUser.set(subscription.user_id, subscription);
    }
    if (
      (PAID_ACCESS_STATUSES as readonly string[]).includes(subscription.status)
      && !paidSubscriptionByUser.has(subscription.user_id)
    ) {
      paidSubscriptionByUser.set(subscription.user_id, subscription);
    }
  }

  // Per-drill mastery per student.
  const progByEmail = new Map<string, Record<string, StudentDrillStat>>();
  for (const r of progress) {
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
  for (const r of testAttempts) {
    const entry = testByEmail.get(r.email) ?? { best: null, count: 0 };
    entry.count += 1;
    if (typeof r.total_score === "number") {
      entry.best = entry.best == null ? r.total_score : Math.max(entry.best, r.total_score);
    }
    testByEmail.set(r.email, entry);
  }

  const rows: StudentRow[] = users.map((u) => {
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
    const grant = grantByUser.get(u.id) ?? null;
    const paidSubscription = paidSubscriptionByUser.get(u.id) ?? null;
    const latestSubscription = latestSubscriptionByUser.get(u.id) ?? null;
    const grantPlan = grant ? normalizePlanCode(grant.plan_code) : null;
    const subscriptionPlan = paidSubscription ? normalizePlanCode(paidSubscription.plan_code) : null;
    const legacyPlan = normalizeLegacyPlanCode(u.plan);
    const plan = u.account_status === "active"
      ? effectivePlan(grantPlan, subscriptionPlan, legacyPlan)
      : "free";
    const accessSource: AccessSource = u.account_status !== "active" ? "free"
      : paidSubscription && plan === subscriptionPlan ? "subscription"
      : grant && plan === grantPlan ? "grant"
      : u.plan && plan === legacyPlan ? "legacy"
      : "free";
    const isComplimentary = isComplimentaryAccount({
      legacyPlan: u.plan,
      isTestAccount: u.is_test_account,
      activeGrantPlan: grant?.plan_code,
      hasPaidSubscription: paidSubscription !== null,
    });
    return {
      id: u.id,
      email: u.email,
      name: id.name,
      initials: id.initials,
      plan,
      accessSource,
      legacyPlan,
      subscriptionPlan: latestSubscription ? normalizePlanCode(latestSubscription.plan_code) : null,
      subscriptionStatus: latestSubscription?.status ?? null,
      subscriptionPeriodStart: latestSubscription?.current_period_start ?? null,
      subscriptionPeriodEnd: latestSubscription?.current_period_end ?? null,
      cancelAtPeriodEnd: latestSubscription?.cancel_at_period_end ?? false,
      pendingPlan: latestSubscription?.pending_plan_code
        ? normalizePlanCode(latestSubscription.pending_plan_code)
        : null,
      pendingChangeEffectiveAt: latestSubscription?.pending_change_effective_at ?? null,
      grantPlan,
      grantSource: grant?.source ?? null,
      grantExpiresAt: grant?.expires_at ?? null,
      isComplimentary,
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
