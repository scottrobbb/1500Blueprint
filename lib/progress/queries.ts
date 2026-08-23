import "server-only";

import { getTestProgress } from "@/lib/gamification/state";
import { drillTitle } from "@/lib/drills/registry";
import { getQuestionBankDashboard } from "@/lib/question-bank/queries";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { isMissingTestSnapshotColumnError } from "./database";
import { buildStudentProgress } from "./summary";
import type { DrillSessionHistory, ProgressActivityItem, StudentProgress } from "./types";

type CoreProgress = {
  lessonsCompleted: number;
  coursePracticeSessions: number;
  coursePracticeAttempted: number;
  coursePracticeCorrect: number;
  drillQuestionAttempted: number;
  drillQuestionCorrect: number;
  drillSessions: number;
  uniqueDrillQuestions: number;
  trackedDrillAttempts: number;
};

const EMPTY_CORE: CoreProgress = {
  lessonsCompleted: 0,
  coursePracticeSessions: 0,
  coursePracticeAttempted: 0,
  coursePracticeCorrect: 0,
  drillQuestionAttempted: 0,
  drillQuestionCorrect: 0,
  drillSessions: 0,
  uniqueDrillQuestions: 0,
  trackedDrillAttempts: 0,
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function normalizeCoreProgress(value: unknown): CoreProgress {
  const row = record(value);
  return {
    lessonsCompleted: count(row.lessonsCompleted),
    coursePracticeSessions: count(row.coursePracticeSessions),
    coursePracticeAttempted: count(row.coursePracticeAttempted),
    coursePracticeCorrect: count(row.coursePracticeCorrect),
    drillQuestionAttempted: count(row.drillQuestionAttempted),
    drillQuestionCorrect: count(row.drillQuestionCorrect),
    drillSessions: count(row.drillSessions),
    uniqueDrillQuestions: count(row.uniqueDrillQuestions),
    trackedDrillAttempts: count(row.trackedDrillAttempts),
  };
}

async function loadCoreProgress(email: string): Promise<CoreProgress> {
  const { data, error } = await supabaseAdmin().rpc("get_student_progress", { p_email: email });
  if (!error) return normalizeCoreProgress(data);
  if (error.code !== "PGRST202" && error.code !== "42883") {
    throw new Error(`Could not load student progress [${error.code}]: ${error.message}`);
  }
  return loadCoreProgressFallback(email);
}

async function loadCoreProgressFallback(email: string): Promise<CoreProgress> {
  const db = supabaseAdmin();
  const [coursePractice, drillQuestions, drillSessions, uniqueDrills, lessons] = await Promise.all([
    db.from("course_practice_attempts").select("question_count,correct_count").eq("email", email).returns<{ question_count: number; correct_count: number }[]>(),
    db.from("drill_question_attempts").select("correct").eq("email", email).eq("source", "drill").returns<{ correct: boolean }[]>(),
    db.from("drill_attempts").select("id", { count: "exact", head: true }).eq("email", email),
    db.from("drill_question_progress").select("attempts").eq("email", email).returns<{ attempts: number }[]>(),
    db.from("course_lesson_completions").select("lesson_id", { count: "exact", head: true }).eq("email", email),
  ]);
  if (coursePractice.error) throw new Error(`Could not load course practice progress [${coursePractice.error.code}]: ${coursePractice.error.message}`);
  if (drillQuestions.error && drillQuestions.error.code !== "42P01" && drillQuestions.error.code !== "PGRST205") {
    throw new Error(`Could not load drill answer progress [${drillQuestions.error.code}]: ${drillQuestions.error.message}`);
  }
  if (drillSessions.error) throw new Error(`Could not load drill session progress [${drillSessions.error.code}]: ${drillSessions.error.message}`);
  if (uniqueDrills.error) throw new Error(`Could not load unique drill progress [${uniqueDrills.error.code}]: ${uniqueDrills.error.message}`);
  if (lessons.error) throw new Error(`Could not load lesson progress [${lessons.error.code}]: ${lessons.error.message}`);
  const courseRows = coursePractice.data ?? [];
  const drillRows = drillQuestions.data ?? [];
  const uniqueRows = uniqueDrills.data ?? [];
  return {
    ...EMPTY_CORE,
    lessonsCompleted: lessons.count ?? 0,
    coursePracticeSessions: courseRows.length,
    coursePracticeAttempted: courseRows.reduce((sum, row) => sum + row.question_count, 0),
    coursePracticeCorrect: courseRows.reduce((sum, row) => sum + row.correct_count, 0),
    drillQuestionAttempted: drillRows.length,
    drillQuestionCorrect: drillRows.filter((row) => row.correct).length,
    drillSessions: drillSessions.count ?? 0,
    uniqueDrillQuestions: uniqueRows.length,
    trackedDrillAttempts: uniqueRows.reduce((sum, row) => sum + row.attempts, 0),
  };
}

type DrillSessionRow = {
  id: string;
  drill_slug: string;
  score: number | null;
  correct: number | null;
  total: number | null;
  created_at: string;
};

async function loadRecentDrillSessions(email: string): Promise<DrillSessionHistory[]> {
  const { data, error } = await supabaseAdmin()
    .from("drill_attempts")
    .select("id,drill_slug,score,correct,total,created_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(8)
    .returns<DrillSessionRow[]>();
  if (error) throw new Error(`Could not load drill sessions [${error.code}]: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    drillSlug: row.drill_slug,
    title: drillTitle(row.drill_slug),
    score: row.score,
    correct: row.correct,
    total: row.total,
    createdAt: row.created_at,
  }));
}

async function loadRecentDrillAnswers(email: string): Promise<ProgressActivityItem[]> {
  const { data, error } = await supabaseAdmin()
    .from("drill_question_attempts")
    .select("id,drill_slug,correct,score,attempted_at")
    .eq("email", email)
    .eq("source", "drill")
    .order("attempted_at", { ascending: false })
    .limit(12)
    .returns<{ id: string; drill_slug: string; correct: boolean; score: number | null; attempted_at: string }[]>();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(`Could not load drill answer history [${error.code}]: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: `drill-${row.id}`,
    kind: "drill",
    title: drillTitle(row.drill_slug),
    detail: row.score == null ? (row.correct ? "Correct answer" : "Incorrect answer") : `${row.correct ? "Passed" : "Below passing"} · ${row.score}%`,
    occurredAt: row.attempted_at,
    href: "/ultimate/drills",
    outcome: row.correct ? "positive" : "negative",
  }));
}

async function loadRecentQuestionBankAnswers(email: string): Promise<ProgressActivityItem[]> {
  const { data, error } = await supabaseAdmin()
    .from("question_bank_attempts")
    .select("id,section,correct,attempted_at")
    .eq("email", email)
    .order("attempted_at", { ascending: false })
    .limit(12)
    .returns<{ id: string; section: "rw" | "math"; correct: boolean; attempted_at: string }[]>();
  if (error) throw new Error(`Could not load Question Bank history [${error.code}]: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: `bank-${row.id}`,
    kind: "question_bank",
    title: row.section === "rw" ? "Reading & Writing Question Bank" : "Math Question Bank",
    detail: row.correct ? "Correct answer" : "Incorrect answer",
    occurredAt: row.attempted_at,
    href: row.section === "rw" ? "/ultimate/bank/reading-writing" : "/ultimate/bank/math",
    outcome: row.correct ? "positive" : "negative",
  }));
}

async function loadRecentCoursePractice(email: string): Promise<ProgressActivityItem[]> {
  const { data, error } = await supabaseAdmin()
    .from("course_practice_attempts")
    .select("id,block_id,score,correct_count,question_count,passed,completed_at")
    .eq("email", email)
    .order("completed_at", { ascending: false })
    .limit(12)
    .returns<{ id: string; block_id: string; score: number; correct_count: number; question_count: number; passed: boolean; completed_at: string }[]>();
  if (error) throw new Error(`Could not load course practice history [${error.code}]: ${error.message}`);
  const rows = data ?? [];
  const blockIds = [...new Set(rows.map((row) => row.block_id))];
  const blocks = blockIds.length > 0
    ? await supabaseAdmin().from("course_lesson_blocks").select("id,content").in("id", blockIds).returns<{ id: string; content: unknown }[]>()
    : { data: [] as { id: string; content: unknown }[], error: null };
  if (blocks.error) throw new Error(`Could not load course practice titles [${blocks.error.code}]: ${blocks.error.message}`);
  const titles = new Map((blocks.data ?? []).map((block) => {
    const content = record(block.content);
    const practice = record(content.practice);
    const title = typeof practice.title === "string" ? practice.title : typeof content.title === "string" ? content.title : "Course practice";
    return [block.id, title];
  }));
  return rows.map((row) => ({
    id: `course-${row.id}`,
    kind: "course_practice",
    title: titles.get(row.block_id) ?? "Course practice",
    detail: `${row.correct_count}/${row.question_count} correct · ${row.score}%`,
    occurredAt: row.completed_at,
    href: "/ultimate/courses",
    outcome: row.passed ? "positive" : "negative",
  }));
}

async function loadRecentTests(email: string): Promise<ProgressActivityItem[]> {
  type RecentTestRow = {
    id: string;
    test_slug: string;
    total_score: number | null;
    test_title: string | null;
    created_at: string;
    completed_at: string | null;
  };
  const db = supabaseAdmin();
  const current = await db
    .from("test_attempts")
    .select("id,test_slug,total_score,test_title,created_at,completed_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(8)
    .returns<RecentTestRow[]>();
  let rows = current.data ?? [];
  if (current.error) {
    if (!isMissingTestSnapshotColumnError(current.error)) {
      throw new Error(`Could not load practice test history [${current.error.code}]: ${current.error.message}`);
    }
    const legacy = await db
      .from("test_attempts")
      .select("id,test_slug,total_score,created_at,completed_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<Omit<RecentTestRow, "test_title">[]>();
    if (legacy.error) throw new Error(`Could not load practice test history [${legacy.error.code}]: ${legacy.error.message}`);
    rows = (legacy.data ?? []).map((row) => ({ ...row, test_title: null }));
  }
  return rows.map((row) => ({
    id: `test-${row.id}`,
    kind: "practice_test",
    title: row.test_title ?? "Full-length practice test",
    detail: row.total_score == null ? "Completed" : `Score ${row.total_score}`,
    occurredAt: row.completed_at ?? row.created_at,
    href: `/practice-test/${row.test_slug}/results/${row.id}?workspace=ultimate`,
    outcome: "neutral",
  }));
}

async function loadRecentLessons(email: string): Promise<ProgressActivityItem[]> {
  const { data, error } = await supabaseAdmin()
    .from("course_lesson_completions")
    .select("lesson_id,completed_at")
    .eq("email", email)
    .order("completed_at", { ascending: false })
    .limit(8)
    .returns<{ lesson_id: string; completed_at: string }[]>();
  if (error) throw new Error(`Could not load lesson history [${error.code}]: ${error.message}`);
  const rows = data ?? [];
  const ids = rows.map((row) => row.lesson_id);
  const lessons = ids.length > 0
    ? await supabaseAdmin().from("course_lessons").select("id,title").in("id", ids).returns<{ id: string; title: string }[]>()
    : { data: [] as { id: string; title: string }[], error: null };
  if (lessons.error) throw new Error(`Could not load lesson titles [${lessons.error.code}]: ${lessons.error.message}`);
  const titles = new Map((lessons.data ?? []).map((lesson) => [lesson.id, lesson.title]));
  return rows.map((row) => ({
    id: `lesson-${row.lesson_id}-${row.completed_at}`,
    kind: "lesson",
    title: titles.get(row.lesson_id) ?? "Course lesson",
    detail: "Lesson completed",
    occurredAt: row.completed_at,
    href: "/ultimate/courses",
    outcome: "positive",
  }));
}

export async function getStudentProgress(email: string): Promise<StudentProgress> {
  const db = supabaseAdmin();
  const [core, questionBank, tests, recentSessions, drillAnswers, bankAnswers, coursePractice, recentTests, lessons, totalLessons] = await Promise.all([
    loadCoreProgress(email),
    getQuestionBankDashboard(email),
    getTestProgress(email),
    loadRecentDrillSessions(email),
    loadRecentDrillAnswers(email),
    loadRecentQuestionBankAnswers(email),
    loadRecentCoursePractice(email),
    loadRecentTests(email),
    loadRecentLessons(email),
    db.from("course_lessons").select("id", { count: "exact", head: true }).eq("status", "published"),
  ]);
  if (totalLessons.error) throw new Error(`Could not load lesson total [${totalLessons.error.code}]: ${totalLessons.error.message}`);

  return buildStudentProgress({
    lessonsCompleted: core.lessonsCompleted,
    totalLessons: totalLessons.count ?? 0,
    questionBank: questionBank.summary,
    coursePractice: { attempted: core.coursePracticeAttempted, correct: core.coursePracticeCorrect },
    drills: {
      attempted: core.drillQuestionAttempted,
      correct: core.drillQuestionCorrect,
      sessions: core.drillSessions,
      uniqueQuestions: core.uniqueDrillQuestions,
      trackedAttempts: core.trackedDrillAttempts,
      recentSessions,
    },
    tests: {
      count: tests.testsDone,
      latestScore: tests.latestScore,
      bestScore: tests.bestScore,
      improvement: tests.improvement,
    },
    recentActivity: [...drillAnswers, ...bankAnswers, ...coursePractice, ...recentTests, ...lessons],
  });
}
