import "server-only";

import type { ChoiceId, Difficulty } from "@/lib/sat/types";
import {
  MATH_DOMAINS,
  boundedQuestionBankSessionLimit,
  calculateAccuracy,
  canAccessQuestionBankLevel,
  emptyLevelBreakdown,
  isMathDomain,
  normalizeMathResponse,
  prioritizeBoundedQuestions,
  prioritizeUnattemptedQuestions,
  questionBankLevel,
  selectQuestionBankSession,
  type MathAnswerType,
  type MathBankCatalog,
  type MathChoice,
  type MathCompletionFilter,
  type MathDifficultyFilter,
  type MathDomain,
  type MathRunnerQuestion,
  type MathSkillMetric,
  type QuestionBankLevel,
} from "@/lib/question-bank/math";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { isQuestionBankRuntimeReady } from "@/lib/question-bank/eligibility";
import { signCourseAssetReferences } from "@/lib/courses/assets.server";

type MathQuestionRow = {
  id: string;
  domain: string | null;
  skill: string | null;
  difficulty: string;
  answer_type: string;
  stem: string | null;
  passage: string | null;
  figure_url: string | null;
  content: Record<string, unknown> | null;
  explanation: string | null;
  created_at: string;
};

type MathSkillRow = {
  domain: string;
  name: string;
  sort: number;
};

type AttemptRow = {
  id: string;
  question_id: string;
  correct: boolean;
};

type LegacyProgressRow = {
  question_id: string;
  attempts: number;
  mastered_at: string | null;
};

type QuestionActivity = {
  attemptedIds: Set<string>;
  attemptsByQuestion: Map<string, { attempts: number; correct: number }>;
  hasAccuracy: boolean;
};

export type MathSessionFilters = {
  skills: string[];
  difficulty: MathDifficultyFilter;
  completion: MathCompletionFilter;
};

export type MathQuestionForGrading = {
  question: MathRunnerQuestion;
  acceptedAnswers: string[];
  correctChoice: ChoiceId | null;
  explanation: string;
};

export async function getMathBankCatalog(
  email: string,
  options: { strictActivity?: boolean; includeChallenge?: boolean } = {},
): Promise<MathBankCatalog> {
  const [loadedQuestions, skills] = await Promise.all([loadEligibleMathRows(), loadMathSkills()]);
  const questions = filterChallengeRows(loadedQuestions, options.includeChallenge ?? true);
  const activity = await loadQuestionActivity(
    email,
    questions.map((question) => question.id),
    options.strictActivity,
  );
  const metrics = buildSkillMetrics(skills, questions, activity);

  return {
    totalAvailable: questions.length,
    totalAttempted: questions.filter((question) => activity.attemptedIds.has(question.id)).length,
    skills: metrics,
  };
}

export async function getMathRunnerQuestions(
  email: string,
  filters: MathSessionFilters,
  limit: number | null = null,
  options: { includeChallenge?: boolean } = {},
): Promise<MathRunnerQuestion[]> {
  const rows = filterChallengeRows(await loadEligibleMathRows(), options.includeChallenge ?? true);
  const activity = await loadQuestionActivity(email, rows.map((question) => question.id));
  const selectedSkills = new Set(filters.skills);
  const skillRows = rows.filter((row) => (
    selectedSkills.size === 0 || (row.skill && selectedSkills.has(row.skill))
  ));
  const completionRows = skillRows.filter((row) => matchesCompletion(row.id, filters.completion, activity));
  const preferredRows = completionRows.filter((row) => matchesDifficultyFilter(row, filters.difficulty));
  const sessionLimit = boundedQuestionBankSessionLimit(limit, selectedSkills.size > 0);
  const preferred = toMathRunnerQuestions(prioritizeUnattemptedQuestions(preferredRows, activity.attemptedIds));
  if (preferred.length >= sessionLimit) {
    return selectQuestionBankSession(preferred, sessionLimit, activity.attemptedIds);
  }

  const candidates = prioritizeBoundedQuestions(
    [
      preferred,
      toMathRunnerQuestions(prioritizeUnattemptedQuestions(completionRows, activity.attemptedIds)),
      toMathRunnerQuestions(prioritizeUnattemptedQuestions(skillRows, activity.attemptedIds)),
    ],
    rows.length,
  );
  return selectQuestionBankSession(candidates, sessionLimit, activity.attemptedIds);
}

function matchesCompletion(
  questionId: string,
  completion: MathCompletionFilter,
  activity: QuestionActivity,
): boolean {
  if (completion === "all") return true;
  const attempted = activity.attemptedIds.has(questionId);
  return completion === "attempted" ? attempted : !attempted;
}

// Challenge questions carry a raw difficulty (usually "hard") but are
// carved into their own "challenge" level -- comparing by level instead of
// raw difficulty keeps "Hard" and "Challenge" mutually exclusive.
function matchesDifficultyFilter(row: MathQuestionRow, difficulty: MathDifficultyFilter): boolean {
  if (difficulty === "all") return true;
  const rowDifficulty = isDifficulty(row.difficulty) ? row.difficulty : "medium";
  return questionBankLevel(rowDifficulty, row.content) === difficulty;
}

function filterChallengeRows(rows: MathQuestionRow[], includeChallenge: boolean): MathQuestionRow[] {
  if (includeChallenge) return rows;
  return rows.filter((row) => {
    const difficulty = isDifficulty(row.difficulty) ? row.difficulty : "medium";
    return canAccessQuestionBankLevel(questionBankLevel(difficulty, row.content), false);
  });
}

function toMathRunnerQuestions(rows: MathQuestionRow[]): MathRunnerQuestion[] {
  return rows.map(toRunnerQuestion).filter((question): question is MathRunnerQuestion => question !== null);
}

export async function getMathQuestionForGrading(
  questionId: string,
): Promise<MathQuestionForGrading | null> {
  const rows = await loadEligibleMathRows(questionId);
  const row = rows[0];
  if (!row) return null;
  const question = toRunnerQuestion(row);
  if (!question) return null;

  const acceptedAnswers = readAcceptedAnswers(row.content);
  const correctChoice = readCorrectChoice(row.content);
  if (question.answerType === "grid_in" && acceptedAnswers.length === 0) return null;
  if (question.answerType === "mc_single" && !correctChoice) return null;

  return {
    question,
    acceptedAnswers,
    correctChoice,
    explanation: row.explanation?.trim() || "A full solution is not available yet.",
  };
}

export function gradeMathResponse(question: MathQuestionForGrading, response: string): boolean {
  if (question.question.answerType === "mc_single") return response === question.correctChoice;
  const normalized = normalizeMathResponse(response);
  return question.acceptedAnswers.some((answer) => normalizeMathResponse(answer) === normalized);
}

export function getCorrectAnswerLabel(question: MathQuestionForGrading): string {
  if (question.question.answerType === "mc_single") {
    const choice = question.question.choices.find((item) => item.id === question.correctChoice);
    return choice ? `${choice.id}. ${choice.text}` : question.correctChoice ?? "";
  }
  return question.acceptedAnswers.join(" or ");
}

async function loadEligibleMathRows(questionId?: string): Promise<MathQuestionRow[]> {
  const db = supabaseAdmin();
  const catalogIds = await loadEnabledCatalogIds(questionId);
  if (catalogIds.length === 0) return [];

  const rows: MathQuestionRow[] = [];
  for (const idBatch of chunks(catalogIds, 100)) {
    const questions = await db
      .from("drill_questions")
      .select(QUESTION_SELECT)
      .in("id", idBatch)
      .eq("status", "published")
      .eq("drill_slug", "targeted-math")
      .eq("section", "math")
      .in("answer_type", ["mc_single", "grid_in"])
      .returns<MathQuestionRow[]>();
    if (questions.error) throw databaseError("Could not load Math bank questions", questions.error);
    rows.push(...(questions.data ?? []));
  }
  return signCourseAssetReferences(rows
    .filter((row) => isQuestionBankRuntimeReady({
      drillSlug: "targeted-math",
      section: "math",
      answerType: row.answer_type,
      domain: row.domain,
      skill: row.skill,
      difficulty: row.difficulty,
      stem: row.stem,
      passage: row.passage,
      content: row.content,
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at)));
}

const QUESTION_SELECT =
  "id,domain,skill,difficulty,answer_type,stem,passage,figure_url,content,explanation,created_at";

async function loadMathSkills(): Promise<MathSkillRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("sat_skills")
    .select("domain,name,sort")
    .eq("section", "math")
    .returns<MathSkillRow[]>();
  if (error) throw databaseError("Could not load Math taxonomy", error);
  return data ?? [];
}

async function loadEnabledCatalogIds(questionId?: string): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabaseAdmin()
      .from("question_bank_catalog")
      .select("question_id")
      .eq("enabled", true)
      .order("question_id")
      .range(offset, offset + 999);
    if (questionId) query = query.eq("question_id", questionId);
    const result = await query.returns<{ question_id: string }[]>();
    if (result.error) throw databaseError("Could not load Math Question Bank catalog", result.error);
    const page = result.data ?? [];
    ids.push(...page.map((item) => item.question_id));
    if (page.length < 1000 || questionId) break;
  }
  return ids;
}

async function loadQuestionActivity(
  email: string,
  questionIds: string[],
  strict = false,
): Promise<QuestionActivity> {
  if (questionIds.length === 0) return emptyActivity(false);
  const attempts = await loadAttemptRows(email, questionIds);

  if (!attempts.error) {
    const activity = emptyActivity(true);
    for (const row of attempts.data) {
      activity.attemptedIds.add(row.question_id);
      const current = activity.attemptsByQuestion.get(row.question_id) ?? { attempts: 0, correct: 0 };
      current.attempts += 1;
      if (row.correct) current.correct += 1;
      activity.attemptsByQuestion.set(row.question_id, current);
    }
    return activity;
  }
  if (strict) throw databaseError("Could not load Math Question Bank activity", attempts.error);

  const legacy = await loadLegacyProgressRows(email, questionIds);
  if (legacy.error) throw databaseError("Could not load Math progress", legacy.error);

  const activity = emptyActivity(false);
  for (const row of legacy.data) {
    activity.attemptedIds.add(row.question_id);
    activity.attemptsByQuestion.set(row.question_id, {
      attempts: row.attempts,
      correct: row.mastered_at ? 1 : 0,
    });
  }
  return activity;
}

type BatchResult<T> = {
  data: T[];
  error: { message: string; code?: string } | null;
};

async function loadAttemptRows(email: string, questionIds: string[]): Promise<BatchResult<AttemptRow>> {
  const rows: AttemptRow[] = [];
  for (const questionIdBatch of chunks(questionIds, 100)) {
    let offset = 0;
    while (true) {
      const result = await supabaseAdmin()
        .from("question_bank_attempts")
        .select("id,question_id,correct")
        .eq("email", email)
        .in("question_id", questionIdBatch)
        .order("id")
        .range(offset, offset + 999)
        .returns<AttemptRow[]>();
      if (result.error) return { data: [], error: result.error };
      const page = result.data ?? [];
      rows.push(...page);
      if (page.length < 1000) break;
      offset += 1000;
    }
  }
  return { data: rows, error: null };
}

async function loadLegacyProgressRows(
  email: string,
  questionIds: string[],
): Promise<BatchResult<LegacyProgressRow>> {
  const rows: LegacyProgressRow[] = [];
  for (const questionIdBatch of chunks(questionIds, 100)) {
    const result = await supabaseAdmin()
      .from("drill_question_progress")
      .select("question_id,attempts,mastered_at")
      .eq("email", email)
      .eq("drill_slug", "targeted-math")
      .in("question_id", questionIdBatch)
      .returns<LegacyProgressRow[]>();
    if (result.error) return { data: [], error: result.error };
    rows.push(...result.data ?? []);
  }
  return { data: rows, error: null };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function buildSkillMetrics(
  skills: MathSkillRow[],
  questions: MathQuestionRow[],
  activity: QuestionActivity,
): MathSkillMetric[] {
  const metrics = skills
    .filter((skill): skill is MathSkillRow & { domain: MathDomain } => isMathDomain(skill.domain))
    .map<MathSkillMetric>((skill) => ({
      domain: skill.domain,
      name: skill.name,
      sort: skill.sort,
      available: 0,
      attempted: 0,
      attempts: 0,
      correct: 0,
      accuracy: null,
      byLevel: emptyLevelBreakdown(),
    }));
  const byName = new Map(metrics.map((metric) => [metric.name, metric]));
  const byLevelAttempts = new Map<string, Record<QuestionBankLevel, { attempts: number; correct: number }>>();

  for (const question of questions) {
    const taxonomy = resolveTaxonomy(question);
    const metric = taxonomy ? byName.get(taxonomy.skill) : undefined;
    if (!metric) continue;
    metric.available += 1;
    const attempted = activity.attemptedIds.has(question.id);
    if (attempted) metric.attempted += 1;
    const questionActivity = activity.attemptsByQuestion.get(question.id);
    if (questionActivity) {
      metric.attempts += questionActivity.attempts;
      metric.correct += questionActivity.correct;
    }

    if (isDifficulty(question.difficulty)) {
      const level = questionBankLevel(question.difficulty, question.content);
      const bucket = metric.byLevel[level];
      bucket.available += 1;
      if (attempted) bucket.attempted += 1;
      if (questionActivity) {
        const attemptTotals = byLevelAttempts.get(metric.name) ?? { easy: { attempts: 0, correct: 0 }, medium: { attempts: 0, correct: 0 }, hard: { attempts: 0, correct: 0 }, challenge: { attempts: 0, correct: 0 } };
        attemptTotals[level].attempts += questionActivity.attempts;
        attemptTotals[level].correct += questionActivity.correct;
        byLevelAttempts.set(metric.name, attemptTotals);
      }
    }
  }

  for (const metric of metrics) {
    metric.accuracy = activity.hasAccuracy ? calculateAccuracy(metric.correct, metric.attempts) : null;
    const attemptTotals = byLevelAttempts.get(metric.name);
    for (const level of ["easy", "medium", "hard", "challenge"] as const) {
      const totals = attemptTotals?.[level];
      metric.byLevel[level].accuracy = activity.hasAccuracy && totals
        ? calculateAccuracy(totals.correct, totals.attempts)
        : null;
    }
  }

  return metrics.sort((a, b) => {
    const domainOrder = MATH_DOMAINS.indexOf(a.domain) - MATH_DOMAINS.indexOf(b.domain);
    return domainOrder || a.sort - b.sort;
  });
}

function toRunnerQuestion(row: MathQuestionRow): MathRunnerQuestion | null {
  const taxonomy = resolveTaxonomy(row);
  if (!taxonomy || !isDifficulty(row.difficulty)) return null;
  if (row.answer_type !== "mc_single" && row.answer_type !== "grid_in") return null;
  const prompt = row.stem?.trim() || row.passage?.trim();
  if (!prompt) return null;
  const choices = row.answer_type === "mc_single" ? readChoices(row.content) : [];
  if (row.answer_type === "mc_single" && choices.length === 0) return null;

  return {
    id: row.id,
    domain: taxonomy.domain,
    skill: taxonomy.skill,
    difficulty: row.difficulty,
    level: questionBankLevel(row.difficulty, row.content),
    answerType: row.answer_type as MathAnswerType,
    prompt,
    passage: row.stem?.trim() ? row.passage : null,
    figureUrl: row.figure_url,
    choices,
  };
}

function resolveTaxonomy(row: MathQuestionRow): { domain: MathDomain; skill: string } | null {
  if (isMathDomain(row.domain) && row.skill) {
    return { domain: row.domain, skill: row.skill };
  }

  // Three legacy targeted-Math rows predate mandatory SAT taxonomy tags. Keep
  // them usable in the bank while the source content is cleaned up in the CMS.
  const prompt = `${row.stem ?? ""} ${row.passage ?? ""}`.toLowerCase();
  if (/circle|circular|circumference|diameter|radius/.test(prompt)) {
    return { domain: "Geometry and Trigonometry", skill: "Circles" };
  }
  if (row.domain === "Advanced Math") {
    return {
      domain: "Advanced Math",
      skill: "Nonlinear equations in one variable and systems of equations in two variables",
    };
  }
  return null;
}

function readChoices(content: Record<string, unknown> | null): MathChoice[] {
  const source = content?.kind === "mc" && isRecord(content) ? content.choices : content?.choices;
  if (!Array.isArray(source)) return [];
  return source.filter((item): item is MathChoice => {
    if (!isRecord(item)) return false;
    return isChoiceId(item.id) && typeof item.text === "string";
  });
}

function readCorrectChoice(content: Record<string, unknown> | null): ChoiceId | null {
  const value = content?.correct;
  return isChoiceId(value) ? value : null;
}

function readAcceptedAnswers(content: Record<string, unknown> | null): string[] {
  const value = content?.accepted;
  return Array.isArray(value) ? value.filter((answer): answer is string => typeof answer === "string") : [];
}

function emptyActivity(hasAccuracy: boolean): QuestionActivity {
  return {
    attemptedIds: new Set<string>(),
    attemptsByQuestion: new Map<string, { attempts: number; correct: number }>(),
    hasAccuracy,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChoiceId(value: unknown): value is ChoiceId {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function isDifficulty(value: string): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function databaseError(action: string, error: { message: string; code?: string }): Error {
  const code = error.code ? ` [${error.code}]` : "";
  return new Error(`${action}${code}: ${error.message}`);
}
