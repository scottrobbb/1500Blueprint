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
import { boundedQuestionBankSessionLimit, calculateAccuracy, canAccessQuestionBankLevel, prioritizeBoundedQuestions, prioritizeUnattemptedQuestions, questionBankLevel } from "@/lib/question-bank/math";
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
};

export async function getReadingWritingBankCatalog(
  email: string,
  options: { strictActivity?: boolean; includeChallenge?: boolean } = {},
): Promise<ReadingWritingBankCatalog> {
  const [loadedQuestions, skills] = await Promise.all([
    loadEligibleReadingRows(),
    loadReadingSkills(),
  ]);
  const questions = filterChallengeRows(loadedQuestions, options.includeChallenge ?? true);
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
  options: { includeChallenge?: boolean } = {},
): Promise<ReadingWritingRunnerQuestion[]> {
  const rows = filterChallengeRows(await loadEligibleReadingRows(), options.includeChallenge ?? true);
  const activity = await loadQuestionActivity(email, rows.map((question) => question.id));
  const selectedSkills = new Set(filters.skills);
  const skillRows = rows.filter((row) => (
    selectedSkills.size === 0 || (row.skill && selectedSkills.has(row.skill))
  ));
  const completionRows = skillRows.filter((row) => matchesCompletion(row.id, filters.completion, activity));
  const preferredRows = completionRows.filter((row) => (
    filters.difficulty === "all" || row.difficulty === filters.difficulty
  ));
  const sessionLimit = boundedQuestionBankSessionLimit(limit);
  const preferred = toReadingWritingRunnerQuestions(prioritizeUnattemptedQuestions(preferredRows, activity.attemptedIds));
  if (preferred.length >= sessionLimit) return preferred.slice(0, sessionLimit);

  return prioritizeBoundedQuestions(
    [
      preferred,
      toReadingWritingRunnerQuestions(prioritizeUnattemptedQuestions(completionRows, activity.attemptedIds)),
      toReadingWritingRunnerQuestions(prioritizeUnattemptedQuestions(skillRows, activity.attemptedIds)),
    ],
    sessionLimit,
  );
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

function filterChallengeRows(rows: ReadingQuestionRow[], includeChallenge: boolean): ReadingQuestionRow[] {
  if (includeChallenge) return rows;
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
  const catalogIds = await loadEnabledCatalogIds(questionId);
  if (catalogIds.length === 0) return [];

  const rows: ReadingQuestionRow[] = [];
  for (const idBatch of chunks(catalogIds, 100)) {
    const questions = await db
      .from("drill_questions")
      .select(QUESTION_SELECT)
      .in("id", idBatch)
      .eq("status", "published")
      .eq("drill_slug", "grammar")
      .eq("section", "rw")
      .eq("answer_type", "mc_single")
      .returns<ReadingQuestionRow[]>();
    if (questions.error) throw databaseError("Could not load Reading & Writing bank", questions.error);
    rows.push(...(questions.data ?? []));
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
    if (result.error) throw databaseError("Could not load Reading & Writing catalog", result.error);
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
    }));
  const byName = new Map(metrics.map((metric) => [metric.name, metric]));

  for (const question of questions) {
    const metric = question.skill ? byName.get(question.skill) : undefined;
    if (!metric || metric.domain !== question.domain) continue;
    metric.available += 1;
    if (activity.attemptedIds.has(question.id)) metric.attempted += 1;
    const questionActivity = activity.attemptsByQuestion.get(question.id);
    if (questionActivity) {
      metric.attempts += questionActivity.attempts;
      metric.correct += questionActivity.correct;
    }
  }

  for (const metric of metrics) {
    metric.accuracy = activity.hasAccuracy ? calculateAccuracy(metric.correct, metric.attempts) : null;
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
