// Server-only data access for the Ultimate Question Bank landing page.

import "server-only";
import {
  emptyQuestionBankDashboard,
  normalizeQuestionBankDashboard,
  type QuestionBankDashboard,
  type QuestionBankDifficulty,
  type QuestionBankSection,
} from "@/lib/question-bank/dashboard";
import { isQuestionBankRuntimeReady } from "@/lib/question-bank/eligibility";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function getQuestionBankDashboard(
  email: string,
  options: { freeTierOnly?: boolean } = {},
): Promise<QuestionBankDashboard> {
  const { data, error } = await supabaseAdmin().rpc("get_question_bank_dashboard", {
    p_email: email,
    p_free_tier_only: options.freeTierOnly ?? false,
  });

  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return loadFallbackDashboard(email);
    throw new Error(`Could not load Question Bank dashboard [${error.code}]: ${error.message}`);
  }

  return normalizeQuestionBankDashboard(data);
}

type InventoryQuestion = {
  id: string;
  drill_slug: string;
  section: QuestionBankSection;
  domain: string | null;
  skill: string | null;
  difficulty: QuestionBankDifficulty;
  answer_type: string;
  stem: string | null;
  passage: string | null;
  content: Record<string, unknown> | null;
};

type HistoricalAttempt = {
  id: string;
  question_id: string;
  section: QuestionBankSection;
  domain: string | null;
  difficulty: QuestionBankDifficulty;
  correct: boolean;
  duration_ms: number | null;
  attempted_at: string;
};

async function loadFallbackDashboard(email: string): Promise<QuestionBankDashboard> {
  const db = supabaseAdmin();
  const [catalogIds, user, attempts, savedQuestionIds] = await Promise.all([
    loadCatalogIds(),
    db
      .from("users")
      .select("streak_current")
      .eq("email", email)
      .maybeSingle<{ streak_current: number | null }>(),
    loadHistoricalAttempts(email),
    loadSavedQuestionIds(email),
  ]);
  if (user.error) throw new Error(`Could not load Question Bank streak: ${user.error.message}`);

  const questions: InventoryQuestion[] = [];
  for (const idBatch of chunks(catalogIds, 100)) {
    const result = await db
      .from("drill_questions")
      .select("id,drill_slug,section,domain,skill,difficulty,answer_type,stem,passage,content")
      .in("id", idBatch)
      .eq("status", "published")
      .in("section", ["rw", "math"])
      .returns<InventoryQuestion[]>();
    if (result.error) {
      throw new Error(`Could not load Question Bank inventory fallback: ${result.error.message}`);
    }
    questions.push(...(result.data ?? []).filter((question) => isQuestionBankRuntimeReady({
      drillSlug: question.drill_slug,
      section: question.section,
      answerType: question.answer_type,
      domain: question.domain,
      skill: question.skill,
      difficulty: question.difficulty,
      stem: question.stem,
      passage: question.passage,
      content: question.content,
    })));
  }

  const dashboard = emptyQuestionBankDashboard();
  dashboard.summary.streak = user.data?.streak_current ?? 0;

  for (const question of questions) {
    const subject = dashboard.subjects.find((item) => item.section === question.section);
    if (subject) subject.available += 1;

    const difficulty = dashboard.difficulty.find(
      (item) => item.section === question.section && item.difficulty === question.difficulty,
    );
    if (difficulty) difficulty.available += 1;

    const domain = question.domain?.trim() || "Other";
    const topic = dashboard.topics.find(
      (item) => item.section === question.section && item.domain === domain,
    );
    if (topic) {
      topic.available += 1;
    } else {
      dashboard.topics.push({
        section: question.section,
        domain,
        available: 1,
        attempts: 0,
        correct: 0,
        accuracy: 0,
      });
    }
  }

  const solvedBySection = new Map<QuestionBankSection, Set<string>>([
    ["rw", new Set()],
    ["math", new Set()],
  ]);
  const durationByDifficulty = new Map<string, { total: number; count: number }>();
  for (const attempt of attempts) {
    const subject = dashboard.subjects.find((item) => item.section === attempt.section);
    if (!subject) continue;
    subject.attempts += 1;
    if (attempt.correct) subject.correct += 1;
    solvedBySection.get(attempt.section)?.add(attempt.question_id);

    const domain = attempt.domain?.trim() || "Other";
    let topic = dashboard.topics.find(
      (item) => item.section === attempt.section && item.domain === domain,
    );
    if (!topic) {
      topic = { section: attempt.section, domain, available: 0, attempts: 0, correct: 0, accuracy: 0 };
      dashboard.topics.push(topic);
    }
    topic.attempts += 1;
    if (attempt.correct) topic.correct += 1;

    const difficulty = dashboard.difficulty.find(
      (item) => item.section === attempt.section && item.difficulty === attempt.difficulty,
    );
    if (difficulty) {
      difficulty.attempts += 1;
      if (attempt.correct) difficulty.correct += 1;
      if (typeof attempt.duration_ms === "number") {
        const key = `${attempt.section}:${attempt.difficulty}`;
        const duration = durationByDifficulty.get(key) ?? { total: 0, count: 0 };
        duration.total += attempt.duration_ms;
        duration.count += 1;
        durationByDifficulty.set(key, duration);
      }
    }

    const activity = dashboard.activity.find((item) => item.weekStart === weekStart(attempt.attempted_at));
    if (activity) {
      const resultKey = attempt.correct ? "correct" : "wrong";
      activity[resultKey] += 1;
      const difficultyKey = `${attempt.difficulty}${attempt.correct ? "Correct" : "Wrong"}` as
        | "easyCorrect" | "mediumCorrect" | "hardCorrect"
        | "easyWrong" | "mediumWrong" | "hardWrong";
      activity[difficultyKey] += 1;
    }
  }

  dashboard.summary.attempted = attempts.length;
  dashboard.summary.correct = attempts.filter((attempt) => attempt.correct).length;
  dashboard.summary.accuracy = percent(dashboard.summary.correct, dashboard.summary.attempted);
  const eligibleQuestionIds = new Set(questions.map((question) => question.id));
  dashboard.summary.saved = savedQuestionIds.filter((questionId) => eligibleQuestionIds.has(questionId)).length;
  for (const subject of dashboard.subjects) {
    subject.solved = solvedBySection.get(subject.section)?.size ?? 0;
    subject.accuracy = percent(subject.correct, subject.attempts);
  }
  for (const topic of dashboard.topics) topic.accuracy = percent(topic.correct, topic.attempts);
  for (const difficulty of dashboard.difficulty) {
    difficulty.accuracy = percent(difficulty.correct, difficulty.attempts);
    const duration = durationByDifficulty.get(`${difficulty.section}:${difficulty.difficulty}`);
    difficulty.averageDurationMs = duration ? Math.round(duration.total / duration.count) : 0;
  }

  return dashboard;
}

async function loadHistoricalAttempts(email: string): Promise<HistoricalAttempt[]> {
  const rows: HistoricalAttempt[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabaseAdmin()
      .from("question_bank_attempts")
      .select("id,question_id,section,domain,difficulty,correct,duration_ms,attempted_at")
      .eq("email", email)
      .order("id")
      .range(offset, offset + 999)
      .returns<HistoricalAttempt[]>();
    if (result.error) {
      throw new Error(`Could not load Question Bank history fallback: ${result.error.message}`);
    }
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function loadCatalogIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabaseAdmin()
      .from("question_bank_catalog")
      .select("question_id")
      .eq("enabled", true)
      .order("question_id")
      .range(offset, offset + 999)
      .returns<{ question_id: string }[]>();
    if (result.error) {
      throw new Error(`Could not load Question Bank catalog fallback: ${result.error.message}`);
    }
    const page = result.data ?? [];
    ids.push(...page.map((item) => item.question_id));
    if (page.length < 1000) return ids;
  }
}

async function loadSavedQuestionIds(email: string): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabaseAdmin()
      .from("question_bank_saves")
      .select("question_id")
      .eq("email", email)
      .order("question_id")
      .range(offset, offset + 999)
      .returns<{ question_id: string }[]>();
    if (result.error) throw new Error(`Could not load Question Bank saves fallback: ${result.error.message}`);
    const page = result.data ?? [];
    ids.push(...page.map((item) => item.question_id));
    if (page.length < 1000) return ids;
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function percent(correct: number, attempts: number): number {
  return attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
}

function weekStart(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}
