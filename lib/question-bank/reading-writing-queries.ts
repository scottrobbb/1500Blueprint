import "server-only";

import type { ChoiceId, Difficulty } from "@/lib/sat/types";
import {
  READING_WRITING_DOMAINS,
  READING_WRITING_SKILLS,
  isReadingWritingDomain,
  type ReadingWritingBankCatalog,
  type ReadingWritingChoice,
  type ReadingWritingDomain,
  type ReadingWritingRunnerQuestion,
  type ReadingWritingSkillMetric,
} from "@/lib/question-bank/reading-writing";
import {
  boundedQuestionBankSessionLimit,
  calculateAccuracy,
  canAccessQuestionBankLevel,
  emptyLevelBreakdown,
  prioritizeBoundedQuestions,
  prioritizeUnattemptedQuestions,
  questionBankLevel,
  selectQuestionBankSession,
  sortByOriginalOrder,
  type QuestionBankLevel,
} from "@/lib/question-bank/math";
import type { MathSessionFilters } from "@/lib/question-bank/math-queries";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { isQuestionBankRuntimeReady } from "@/lib/question-bank/eligibility";
import { signCourseAssetReferences } from "@/lib/courses/assets.server";

type ReadingQuestionRow = {
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
  accessTier: "free" | "ultimate";
};

type ReadingSkillRow = {
  domain: string;
  name: string;
  sort: number;
};

type AttemptRow = {
  id: string;
  question_id: string;
  correct: boolean;
};

type QuestionActivity = {
  attemptedIds: Set<string>;
  attemptsByQuestion: Map<string, { attempts: number; correct: number }>;
  hasAccuracy: boolean;
};

export type ReadingWritingQuestionForGrading = {
  question: ReadingWritingRunnerQuestion;
  correctChoice: ChoiceId;
  explanation: string;
  accessTier: "free" | "ultimate";
};

export async function getReadingWritingBankCatalog(
  email: string,
  options: { strictActivity?: boolean; includeChallenge?: boolean; freeTierOnly?: boolean } = {},
): Promise<ReadingWritingBankCatalog> {
  const [loadedQuestions, skills] = await Promise.all([
    loadEligibleReadingRows(),
    loadReadingSkills(),
  ]);
  const questions = filterForPlan(loadedQuestions, {
    includeChallenge: options.includeChallenge ?? true,
    freeTierOnly: options.freeTierOnly ?? false,
  });
  const activity = await loadQuestionActivity(
    email,
    questions.map((question) => question.id),
    options.strictActivity,
  );

  return {
    totalAvailable: questions.length,
    totalAttempted: questions.filter((question) => activity.attemptedIds.has(question.id)).length,
    skills: buildSkillMetrics(skills, questions, activity),
  };
}

export async function getReadingWritingRunnerQuestions(
  email: string,
  filters: MathSessionFilters,
  limit: number | null = null,
  options: { includeChallenge?: boolean; freeTierOnly?: boolean } = {},
): Promise<ReadingWritingRunnerQuestion[]> {
  const rows = filterForPlan(await loadEligibleReadingRows(), {
    includeChallenge: options.includeChallenge ?? true,
    freeTierOnly: options.freeTierOnly ?? false,
  });
  const orderIndex = new Map(rows.map((row, index) => [row.id, index]));
  const activity = await loadQuestionActivity(email, rows.map((question) => question.id));
  const selectedSkills = new Set(filters.skills);
  const skillRows = rows.filter((row) => (
    selectedSkills.size === 0 || (row.skill && selectedSkills.has(row.skill))
  ));
  const difficultyRows = skillRows.filter((row) => matchesDifficultyFilter(row, filters.difficulty));
  const preferredRows = difficultyRows.filter((row) => matchesCompletion(row.id, filters.completion, activity));
  const sessionLimit = boundedQuestionBankSessionLimit(limit, selectedSkills.size > 0);
  const preferred = toReadingWritingRunnerQuestions(prioritizeUnattemptedQuestions(preferredRows, activity.attemptedIds));
  if (preferred.length >= sessionLimit) {
    return sortByOriginalOrder(selectQuestionBankSession(preferred, sessionLimit, activity.attemptedIds), orderIndex);
  }

  // Fills out the session by relaxing the completion filter only -- the
  // selected difficulty/level is never relaxed, so filtering to "Challenge"
  // never pads the session with non-challenge questions to hit the size.
  const candidates = prioritizeBoundedQuestions(
    [
      preferred,
      toReadingWritingRunnerQuestions(prioritizeUnattemptedQuestions(difficultyRows, activity.attemptedIds)),
    ],
    rows.length,
  );
  // prioritizeUnattemptedQuestions only influences which questions make the
  // cut when the session has to be truncated -- the questions shown are
  // always restored to their stable, original order (see sortByOriginalOrder)
  // so a question's number in the panel never shifts based on completion.
  return sortByOriginalOrder(selectQuestionBankSession(candidates, sessionLimit, activity.attemptedIds), orderIndex);
}

function matchesCompletion(
  questionId: string,
  completion: MathSessionFilters["completion"],
  activity: QuestionActivity,
): boolean {
  if (completion === "all") return true;
  const attempted = activity.attemptedIds.has(questionId);
  return completion === "attempted" ? attempted : !attempted;
}

// Challenge questions carry a raw difficulty (usually "hard") but are
// carved into their own "challenge" level -- comparing by level instead of
// raw difficulty keeps "Hard" and "Challenge" mutually exclusive.
function matchesDifficultyFilter(row: ReadingQuestionRow, difficulty: MathSessionFilters["difficulty"]): boolean {
  if (difficulty === "all") return true;
  const rowDifficulty = isDifficulty(row.difficulty) ? row.difficulty : "medium";
  return questionBankLevel(rowDifficulty, row.content) === difficulty;
}

// Free-plan sessions are restricted to the curated free-tier pool (a fixed
// set of ~200 questions Scott has flagged in question_bank_catalog), which
// deliberately includes a handful of challenge-level questions -- so
// freeTierOnly takes priority over includeChallenge rather than composing
// with it (a free-tier challenge question must never be stripped just
// because the account otherwise lacks the challengeQuestions entitlement).
function filterForPlan(
  rows: ReadingQuestionRow[],
  options: { includeChallenge: boolean; freeTierOnly: boolean },
): ReadingQuestionRow[] {
  if (options.freeTierOnly) return rows.filter((row) => row.accessTier === "free");
  if (options.includeChallenge) return rows;
  return rows.filter((row) => {
    const difficulty = isDifficulty(row.difficulty) ? row.difficulty : "medium";
    return canAccessQuestionBankLevel(questionBankLevel(difficulty, row.content), false);
  });
}

function toReadingWritingRunnerQuestions(rows: ReadingQuestionRow[]): ReadingWritingRunnerQuestion[] {
  return rows.map(toRunnerQuestion).filter((question): question is ReadingWritingRunnerQuestion => question !== null);
}

export async function getReadingWritingQuestionForGrading(
  questionId: string,
): Promise<ReadingWritingQuestionForGrading | null> {
  const row = (await loadEligibleReadingRows(questionId))[0];
  if (!row) return null;
  const question = toRunnerQuestion(row);
  const correctChoice = readCorrectChoice(row.content);
  if (!question || !correctChoice) return null;

  return {
    question,
    correctChoice,
    explanation: row.explanation?.trim() || "A full explanation is not available yet.",
    accessTier: row.accessTier,
  };
}

export function getReadingWritingCorrectAnswerLabel(
  question: ReadingWritingQuestionForGrading,
): string {
  const choice = question.question.choices.find((item) => item.id === question.correctChoice);
  return choice ? `${choice.id}. ${choice.text}` : question.correctChoice;
}

async function loadEligibleReadingRows(questionId?: string): Promise<ReadingQuestionRow[]> {
  const db = supabaseAdmin();
  const catalogEntries = await loadEnabledCatalogEntries(questionId);
  if (catalogEntries.size === 0) return [];

  const rows: ReadingQuestionRow[] = [];
  for (const idBatch of chunks([...catalogEntries.keys()], 100)) {
    const questions = await db
      .from("drill_questions")
      .select(QUESTION_SELECT)
      .in("id", idBatch)
      .eq("status", "published")
      .eq("drill_slug", "grammar")
      .eq("section", "rw")
      .eq("answer_type", "mc_single")
      .returns<Omit<ReadingQuestionRow, "accessTier">[]>();
    if (questions.error) throw databaseError("Could not load Reading & Writing bank", questions.error);
    rows.push(...(questions.data ?? []).map((row) => ({
      ...row,
      accessTier: catalogEntries.get(row.id) ?? "ultimate",
    })));
  }
  return signCourseAssetReferences(rows
    .filter((row) => isQuestionBankRuntimeReady({
      drillSlug: "grammar",
      section: "rw",
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

async function loadReadingSkills(): Promise<ReadingSkillRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("sat_skills")
    .select("domain,name,sort")
    .eq("section", "rw")
    .returns<ReadingSkillRow[]>();
  if (error) throw databaseError("Could not load Reading & Writing taxonomy", error);
  return data ?? [];
}

async function loadEnabledCatalogEntries(questionId?: string): Promise<Map<string, "free" | "ultimate">> {
  const entries = new Map<string, "free" | "ultimate">();
  for (let offset = 0; ; offset += 1000) {
    let query = supabaseAdmin()
      .from("question_bank_catalog")
      .select("question_id,access_tier")
      .eq("enabled", true)
      .order("question_id")
      .range(offset, offset + 999);
    if (questionId) query = query.eq("question_id", questionId);
    const result = await query.returns<{ question_id: string; access_tier: string }[]>();
    if (result.error) throw databaseError("Could not load Reading & Writing catalog", result.error);
    const page = result.data ?? [];
    for (const item of page) entries.set(item.question_id, item.access_tier === "free" ? "free" : "ultimate");
    if (page.length < 1000 || questionId) break;
  }
  return entries;
}

async function loadQuestionActivity(
  email: string,
  questionIds: string[],
  strict = false,
): Promise<QuestionActivity> {
  const activity = emptyActivity(false);
  if (questionIds.length === 0) return activity;

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
      if (result.error) {
        if (strict) throw databaseError("Could not load Reading & Writing Question Bank activity", result.error);
        return activity;
      }
      activity.hasAccuracy = true;
      const page = result.data ?? [];
      for (const row of page) {
        activity.attemptedIds.add(row.question_id);
        const current = activity.attemptsByQuestion.get(row.question_id) ?? { attempts: 0, correct: 0 };
        current.attempts += 1;
        if (row.correct) current.correct += 1;
        activity.attemptsByQuestion.set(row.question_id, current);
      }
      if (page.length < 1000) break;
      offset += 1000;
    }
  }
  return activity;
}

function buildSkillMetrics(
  skills: ReadingSkillRow[],
  questions: ReadingQuestionRow[],
  activity: QuestionActivity,
): ReadingWritingSkillMetric[] {
  const metrics = skills
    .filter((skill): skill is ReadingSkillRow & { domain: ReadingWritingDomain } => (
      isReadingWritingDomain(skill.domain)
    ))
    .map<ReadingWritingSkillMetric>((skill) => ({
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
    const metric = question.skill ? byName.get(question.skill) : undefined;
    if (!metric || metric.domain !== question.domain) continue;
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
    const domainOrder = READING_WRITING_DOMAINS.indexOf(a.domain) - READING_WRITING_DOMAINS.indexOf(b.domain);
    const skillOrder = READING_WRITING_SKILLS.indexOf(a.name as (typeof READING_WRITING_SKILLS)[number])
      - READING_WRITING_SKILLS.indexOf(b.name as (typeof READING_WRITING_SKILLS)[number]);
    return domainOrder || skillOrder || a.sort - b.sort;
  });
}

function toRunnerQuestion(row: ReadingQuestionRow): ReadingWritingRunnerQuestion | null {
  if (!isReadingWritingDomain(row.domain) || !row.skill || !isDifficulty(row.difficulty)) return null;
  if (row.answer_type !== "mc_single") return null;
  const prompt = row.stem?.trim();
  const passage = row.passage?.trim();
  const choices = readChoices(row.content);
  if (!prompt || !passage || choices.length !== 4) return null;

  return {
    id: row.id,
    domain: row.domain,
    skill: row.skill,
    difficulty: row.difficulty,
    level: questionBankLevel(row.difficulty, row.content),
    answerType: "mc_single",
    prompt,
    passage,
    figureUrl: row.figure_url,
    choices,
  };
}

function readChoices(content: Record<string, unknown> | null): ReadingWritingChoice[] {
  const source = content?.choices;
  if (!Array.isArray(source)) return [];
  return source.filter((item): item is ReadingWritingChoice => (
    isRecord(item) && isChoiceId(item.id) && typeof item.text === "string"
  ));
}

function readCorrectChoice(content: Record<string, unknown> | null): ChoiceId | null {
  return isChoiceId(content?.correct) ? content.correct : null;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
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
