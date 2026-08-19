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
import { calculateAccuracy, questionBankLevel } from "@/lib/question-bank/math";
import type { MathSessionFilters } from "@/lib/question-bank/math-queries";
import { supabaseAdmin } from "@/utils/supabase/admin";

const CREATED_BY = "scott-reading-import";

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
): Promise<ReadingWritingBankCatalog> {
  const [questions, skills] = await Promise.all([
    loadEligibleReadingRows(),
    loadReadingSkills(),
  ]);
  const activity = await loadQuestionActivity(email, questions.map((question) => question.id));

  return {
    totalAvailable: questions.length,
    totalAttempted: questions.filter((question) => activity.attemptedIds.has(question.id)).length,
    skills: buildSkillMetrics(skills, questions, activity),
  };
}

export async function getReadingWritingRunnerQuestions(
  email: string,
  filters: MathSessionFilters,
): Promise<ReadingWritingRunnerQuestion[]> {
  const rows = await loadEligibleReadingRows();
  const activity = await loadQuestionActivity(email, rows.map((question) => question.id));
  const selectedSkills = new Set(filters.skills);

  return rows
    .filter((row) => selectedSkills.size === 0 || (row.skill && selectedSkills.has(row.skill)))
    .filter((row) => filters.difficulty === "all" || row.difficulty === filters.difficulty)
    .filter((row) => {
      if (filters.completion === "all") return true;
      const attempted = activity.attemptedIds.has(row.id);
      return filters.completion === "attempted" ? attempted : !attempted;
    })
    .map(toRunnerQuestion)
    .filter((question): question is ReadingWritingRunnerQuestion => question !== null);
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
  let questionQuery = db
    .from("drill_questions")
    .select(QUESTION_SELECT)
    .eq("drill_slug", "grammar")
    .eq("created_by", CREATED_BY)
    .eq("status", "published")
    .eq("section", "rw")
    .eq("answer_type", "mc_single")
    .order("created_at");
  if (questionId) questionQuery = questionQuery.eq("id", questionId);
  const questions = await questionQuery.returns<ReadingQuestionRow[]>();
  if (questions.error) throw databaseError("Could not load Reading & Writing bank", questions.error);

  return filterByCatalog(questions.data ?? []);
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

async function filterByCatalog(rows: ReadingQuestionRow[]): Promise<ReadingQuestionRow[]> {
  if (rows.length === 0) return [];
  const enabledIds = new Set<string>();

  for (const idBatch of chunks(rows.map((row) => row.id), 100)) {
    const result = await supabaseAdmin()
      .from("question_bank_catalog")
      .select("question_id")
      .eq("enabled", true)
      .in("question_id", idBatch)
      .returns<{ question_id: string }[]>();
    if (result.error) {
      if (isMissingCatalogError(result.error)) return rows;
      throw databaseError("Could not load Reading & Writing catalog", result.error);
    }
    for (const item of result.data ?? []) enabledIds.add(item.question_id);
  }

  return rows.filter((row) => enabledIds.has(row.id));
}

async function loadQuestionActivity(email: string, questionIds: string[]): Promise<QuestionActivity> {
  const activity = emptyActivity(false);
  if (questionIds.length === 0) return activity;

  for (const questionIdBatch of chunks(questionIds, 100)) {
    let offset = 0;
    while (true) {
      const result = await supabaseAdmin()
        .from("question_bank_attempts")
        .select("question_id,correct")
        .eq("email", email)
        .in("question_id", questionIdBatch)
        .range(offset, offset + 999)
        .returns<AttemptRow[]>();
      if (result.error) return activity;
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

function isMissingCatalogError(error: { message: string; code?: string }): boolean {
  return error.code === "42P01"
    || error.code === "PGRST205"
    || /question_bank_catalog.*(?:not find|does not exist|schema cache)/i.test(error.message);
}
