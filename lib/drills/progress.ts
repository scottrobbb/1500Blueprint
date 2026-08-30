// Server-only: per-student drill question progress. Records which questions a
// student has attempted/mastered and drives two features:
//   1. Pool selection — drills stop re-feeding mastered questions (and recycle
//      oldest-seen-first once every question is mastered, so they never dead-end).
//   2. The History tab — list every question a student has worked on.
// Uses the service-role client (bypasses RLS); NEVER import into a Client Component.

import { supabaseAdmin } from "@/utils/supabase/admin";
import type { Difficulty } from "@/lib/sat/types";
import {
  calculateGrammarMastery,
  GRAMMAR_MASTERY_MIN_SCORE,
  type GrammarMasteryState,
} from "./mastery";
import {
  calculateReadingProgress,
  READING_PASS_SCORE,
  type ReadingProgressState,
} from "./readingProgress";
import type {
  AnswerType,
  DrillContent,
  DrillQuestion,
  DrillSlug,
  QuestionStatus,
  SatSection,
} from "./types";

// Drills whose questions are tracked. Flashcards is spaced-repetition (re-showing
// is the point); word-scan / ai-math have no DB-backed questions yet.
const TRACKED: ReadonlySet<string> = new Set(["grammar", "reading", "targeted-math", "vocab"]);
export function isTracked(drillSlug: string): boolean {
  return TRACKED.has(drillSlug);
}

// A question is "mastered" when the student demonstrates it: a perfect AI grade
// for the graded drills, a correct answer for the objective ones.
export function isMastered(
  drillSlug: string,
  result: { score?: number | null; correct?: boolean | null },
): boolean {
  if (drillSlug === "grammar" || drillSlug === "reading") return (result.score ?? 0) >= 100;
  if (drillSlug === "targeted-math" || drillSlug === "vocab") return result.correct === true;
  return false;
}

// "Correct" in progress analytics means an exact correct answer for objective
// drills and meeting the drill's configured passing score for AI evaluations.
// This is deliberately separate from per-question mastery, which still requires
// a perfect AI score before a question leaves the active pool.
export function isPassingDrillAttempt(
  drillSlug: DrillSlug,
  result: { score?: number | null; correct?: boolean | null },
): boolean {
  if (typeof result.correct === "boolean") return result.correct;
  if (drillSlug === "grammar") return (result.score ?? 0) >= GRAMMAR_MASTERY_MIN_SCORE;
  if (drillSlug === "reading") return (result.score ?? 0) >= READING_PASS_SCORE;
  return (result.score ?? 0) >= 100;
}

export async function recordDrillQuestionAttempt(
  email: string,
  input: {
    drillSlug: DrillSlug;
    questionId: string;
    score?: number | null;
    correct?: boolean | null;
    clientToken?: string | null;
    sessionToken?: string | null;
  },
): Promise<void> {
  const { error } = await supabaseAdmin().from("drill_question_attempts").insert({
    email,
    question_id: input.questionId,
    drill_slug: input.drillSlug,
    source: "drill",
    correct: isPassingDrillAttempt(input.drillSlug, input),
    score: typeof input.score === "number" ? input.score : null,
    client_token: input.clientToken ?? null,
    session_token: input.sessionToken ?? null,
  });
  if (error?.code === "23505" && input.clientToken) return;
  if (error) throw progressDatabaseError("Could not save drill answer history", error);
}

export async function hasRecordedDrillQuestionAttempt(
  email: string,
  clientToken: string,
): Promise<boolean> {
  const result = await supabaseAdmin()
    .from("drill_question_attempts")
    .select("id")
    .eq("email", email)
    .eq("client_token", clientToken)
    .maybeSingle<{ id: string }>();
  if (result.error) {
    throw progressDatabaseError("Could not verify drill answer history", result.error);
  }
  return Boolean(result.data);
}

export type DrillQuestionSessionSummary = { correct: number; total: number };

export async function summarizeDrillQuestionSession(
  email: string,
  drillSlug: DrillSlug,
  sessionToken: string,
): Promise<DrillQuestionSessionSummary> {
  const rows: { id: string; correct: boolean }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await supabaseAdmin()
      .from("drill_question_attempts")
      .select("id,correct")
      .eq("email", email)
      .eq("drill_slug", drillSlug)
      .eq("source", "drill")
      .eq("session_token", sessionToken)
      .order("id")
      .range(from, from + pageSize - 1)
      .returns<{ id: string; correct: boolean }[]>();
    if (result.error) {
      throw progressDatabaseError("Could not verify the completed drill session", result.error);
    }
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) break;
  }
  return {
    correct: rows.filter((row) => row.correct).length,
    total: rows.length,
  };
}

export async function recordObjectiveProgress(
  email: string,
  input: {
    drillSlug: "targeted-math" | "vocab";
    questionId: string;
    correct: boolean;
    clientToken: string;
    sessionToken: string;
  },
): Promise<boolean> {
  const result = await supabaseAdmin().rpc("record_objective_drill_answer", {
    p_email: email,
    p_question_id: input.questionId,
    p_drill_slug: input.drillSlug,
    p_correct: input.correct,
    p_client_token: input.clientToken,
    p_session_token: input.sessionToken,
  });
  if (result.error) {
    throw progressDatabaseError("Could not save objective drill progress", result.error);
  }
  return result.data === true;
}

export type ProgressRow = {
  questionId: string;
  attempts: number;
  bestScore: number | null;
  masteredAt: string | null;
  lastSeenAt: string;
};

type DbProgressRow = {
  question_id: string;
  drill_slug: string;
  attempts: number;
  best_score: number | null;
  mastered_at: string | null;
  last_seen_at: string;
};

function progressDatabaseError(
  action: string,
  error: { message: string; code?: string },
): Error {
  const code = error.code ? ` [${error.code}]` : "";
  return new Error(`${action}${code}: ${error.message}`);
}

async function loadProgressMap(email: string, drillSlug: DrillSlug): Promise<Map<string, ProgressRow>> {
  const { data, error } = await supabaseAdmin()
    .from("drill_question_progress")
    .select("question_id,attempts,best_score,mastered_at,last_seen_at")
    .eq("email", email)
    .eq("drill_slug", drillSlug)
    .returns<DbProgressRow[]>();
  if (error) throw progressDatabaseError("Could not load drill progress", error);

  const map = new Map<string, ProgressRow>();
  for (const r of data ?? []) {
    map.set(r.question_id, {
      questionId: r.question_id,
      attempts: r.attempts,
      bestScore: r.best_score,
      masteredAt: r.mastered_at,
      lastSeenAt: r.last_seen_at,
    });
  }
  return map;
}

// Grammar mastery is rebuilt from the append-only attempt ledger. This makes
// the count survive navigation and also restores work recorded before the
// persistent counter was wired into the player.
export async function loadGrammarMastery(email: string): Promise<GrammarMasteryState> {
  const { data, error } = await supabaseAdmin()
    .from("drill_attempts")
    .select("score,created_at")
    .eq("email", email)
    .eq("drill_slug", "grammar")
    .order("created_at", { ascending: true })
    .returns<{ score: number | null; created_at: string }[]>();
  if (error) throw progressDatabaseError("Could not load grammar mastery", error);
  return calculateGrammarMastery((data ?? []).map((row) => row.score));
}

// Reading progression is rebuilt from the same append-only attempt ledger so
// consecutive passes, failures, and level-ups survive navigation and reloads.
export async function loadReadingProgress(email: string): Promise<ReadingProgressState> {
  const { data, error } = await supabaseAdmin()
    .from("drill_attempts")
    .select("score,created_at")
    .eq("email", email)
    .eq("drill_slug", "reading")
    .order("created_at", { ascending: true })
    .returns<{ score: number | null; created_at: string }[]>();
  if (error) throw progressDatabaseError("Could not load reading progress", error);
  return calculateReadingProgress((data ?? []).map((row) => row.score));
}

// Filter + order a drill's published questions for one student:
//   - Active pool = questions not yet mastered, never-seen ones first (then the
//     incoming created_at order).
//   - Once everything is mastered, recycle the whole set oldest-seen-first so the
//     drill keeps working instead of showing an empty screen.
// `questions` is the already-published list (anon-key loaded); order is preserved
// for items in the same bucket since Array.prototype.sort is stable.
export async function selectForStudent(
  drillSlug: DrillSlug,
  email: string,
  questions: DrillQuestion[],
): Promise<DrillQuestion[]> {
  if (questions.length === 0) return questions;
  const progress = await loadProgressMap(email, drillSlug);

  const unmastered = questions.filter((q) => !progress.get(q.id)?.masteredAt);
  if (unmastered.length > 0) {
    return unmastered
      .map((q, i) => ({ q, seen: progress.has(q.id) ? 1 : 0, i }))
      .sort((a, b) => a.seen - b.seen || a.i - b.i)
      .map((x) => x.q);
  }

  return questions
    .map((q, i) => ({ q, lastSeen: progress.get(q.id)?.lastSeenAt ?? "", i }))
    .sort((a, b) => a.lastSeen.localeCompare(b.lastSeen) || a.i - b.i)
    .map((x) => x.q);
}

// Record one attempt: bump attempts + last_seen_at, keep the best score, and set
// mastered_at the first time the question is mastered (it never un-masters).
// Read-then-upsert is fine here — a single student answers sequentially.
export async function recordProgress(
  email: string,
  input: {
    drillSlug: DrillSlug;
    questionId: string;
    score?: number | null;
    correct?: boolean | null;
    source?: "drill" | "question_bank";
    clientToken?: string | null;
    sessionToken?: string | null;
  },
): Promise<void> {
  if (!isTracked(input.drillSlug)) return;
  const db = supabaseAdmin();

  // A browser may retry after losing the response to a successful write. Keep
  // that retry from incrementing mastery twice when the caller supplied a token.
  if (input.source === "drill" && input.clientToken) {
    if (await hasRecordedDrillQuestionAttempt(email, input.clientToken)) return;
  }

  const nowIso = new Date().toISOString();
  const score = typeof input.score === "number" ? input.score : null;
  const mastered = isMastered(input.drillSlug, input);

  const { data: existing, error: readError } = await db
    .from("drill_question_progress")
    .select("attempts,best_score,mastered_at")
    .eq("email", email)
    .eq("question_id", input.questionId)
    .maybeSingle<{ attempts: number; best_score: number | null; mastered_at: string | null }>();
  if (readError) throw progressDatabaseError("Could not read drill progress", readError);

  const attempts = (existing?.attempts ?? 0) + 1;
  const bestScore =
    score == null ? existing?.best_score ?? null : Math.max(existing?.best_score ?? 0, score);
  const masteredAt = existing?.mastered_at ?? (mastered ? nowIso : null);

  const { error: writeError } = await db.from("drill_question_progress").upsert(
    {
      email,
      question_id: input.questionId,
      drill_slug: input.drillSlug,
      attempts,
      best_score: bestScore,
      mastered_at: masteredAt,
      last_seen_at: nowIso,
    },
    { onConflict: "email,question_id" },
  );
  if (writeError) throw progressDatabaseError("Could not save drill progress", writeError);

  // Question Bank Math also updates the shared mastery row. Its authoritative
  // append-only event already lives in question_bank_attempts, so only explicit
  // drill calls write this ledger and dashboard totals never double-count it.
  if (input.source === "drill") {
    await recordDrillQuestionAttempt(email, input);
  }
}

// ---- History --------------------------------------------------------------

export type HistoryEntry = {
  question: DrillQuestion;
  drillSlug: DrillSlug;
  attempts: number;
  bestScore: number | null;
  mastered: boolean;
  lastSeenAt: string;
};

type DbQuestionRow = {
  id: string;
  drill_slug: string;
  section: string | null;
  domain: string | null;
  skill: string | null;
  difficulty: string;
  answer_type: string;
  stem: string | null;
  passage: string | null;
  figure_url: string | null;
  content: Record<string, unknown> | null;
  explanation: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function toQuestion(r: DbQuestionRow): DrillQuestion {
  return {
    id: r.id,
    drillSlug: r.drill_slug as DrillSlug,
    section: (r.section as SatSection | null) ?? null,
    domain: r.domain,
    skill: r.skill,
    difficulty: (r.difficulty ?? "medium") as Difficulty,
    answerType: r.answer_type as AnswerType,
    stem: r.stem,
    passage: r.passage,
    figureUrl: r.figure_url,
    content: (r.content ?? {}) as DrillContent,
    explanation: r.explanation,
    status: r.status as QuestionStatus,
    includeInQuestionBank: false,
    questionBankFreeTier: false,
    visibleInDrill: true,
    createdBy: null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    walkthrough: [],
  };
}

// Every question a student has worked on, most-recent first, optionally scoped to
// one drill. Joins the progress rows to their current question content; questions
// deleted since the attempt are skipped.
export async function loadHistory(email: string, drillSlug?: DrillSlug): Promise<HistoryEntry[]> {
  const db = supabaseAdmin();
  let query = db
    .from("drill_question_progress")
    .select("question_id,drill_slug,attempts,best_score,mastered_at,last_seen_at")
    .eq("email", email)
    .order("last_seen_at", { ascending: false });
  if (drillSlug) query = query.eq("drill_slug", drillSlug);

  const { data: progress, error: progressError } = await query.returns<DbProgressRow[]>();
  if (progressError) throw progressDatabaseError("Could not load drill history", progressError);
  const rows = progress ?? [];
  if (rows.length === 0) return [];

  const { data: questions, error: questionsError } = await db
    .from("drill_questions")
    .select(
      "id,drill_slug,section,domain,skill,difficulty,answer_type,stem,passage,figure_url,content,explanation,status,created_at,updated_at",
    )
    .in("id", rows.map((r) => r.question_id))
    .returns<DbQuestionRow[]>();
  if (questionsError) {
    throw progressDatabaseError("Could not load drill history questions", questionsError);
  }
  const byId = new Map((questions ?? []).map((q) => [q.id, q]));

  const out: HistoryEntry[] = [];
  for (const r of rows) {
    const q = byId.get(r.question_id);
    if (!q) continue;
    out.push({
      question: toQuestion(q),
      drillSlug: r.drill_slug as DrillSlug,
      attempts: r.attempts,
      bestScore: r.best_score,
      mastered: Boolean(r.mastered_at),
      lastSeenAt: r.last_seen_at,
    });
  }
  return out;
}
