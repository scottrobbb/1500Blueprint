import "server-only";

import type { ChoiceId, Difficulty } from "@/lib/sat/types";
import {
  MATH_DOMAINS,
  calculateAccuracy,
  isMathDomain,
  normalizeMathResponse,
  type MathAnswerType,
  type MathBankCatalog,
  type MathChoice,
  type MathCompletionFilter,
  type MathDifficultyFilter,
  type MathDomain,
  type MathRunnerQuestion,
  type MathSkillMetric,
} from "@/lib/question-bank/math";
import { supabaseAdmin } from "@/utils/supabase/admin";

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

export async function getMathBankCatalog(email: string): Promise<MathBankCatalog> {
  const [questions, skills] = await Promise.all([loadEligibleMathRows(), loadMathSkills()]);
  const activity = await loadQuestionActivity(email, questions.map((question) => question.id));
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
): Promise<MathRunnerQuestion[]> {
  const rows = await loadEligibleMathRows();
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
    .filter((question): question is MathRunnerQuestion => question !== null);
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
  let catalogQuery = db
    .from("question_bank_catalog")
    .select("question_id")
    .eq("enabled", true);
  if (questionId) catalogQuery = catalogQuery.eq("question_id", questionId);
  const catalog = await catalogQuery.returns<{ question_id: string }[]>();

  if (!catalog.error) {
    const ids = (catalog.data ?? []).map((row) => row.question_id);
    if (ids.length === 0) return [];
    let questionQuery = db
      .from("drill_questions")
      .select(QUESTION_SELECT)
      .in("id", ids)
      .eq("status", "published")
      .eq("section", "math")
      .in("answer_type", ["mc_single", "grid_in"])
      .order("created_at");
    if (questionId) questionQuery = questionQuery.eq("id", questionId);
    const questions = await questionQuery.returns<MathQuestionRow[]>();
    if (questions.error) throw databaseError("Could not load Math bank questions", questions.error);
    return questions.data ?? [];
  }

  // Pre-migration fallback keeps the preview functional until the explicit
  // question_bank_catalog allowlist has been deployed.
  let fallbackQuery = db
    .from("drill_questions")
    .select(QUESTION_SELECT)
    .eq("drill_slug", "targeted-math")
    .eq("status", "published")
    .eq("section", "math")
    .in("answer_type", ["mc_single", "grid_in"])
    .order("created_at");
  if (questionId) fallbackQuery = fallbackQuery.eq("id", questionId);
  const fallback = await fallbackQuery.returns<MathQuestionRow[]>();
  if (fallback.error) throw databaseError("Could not load fallback Math bank", fallback.error);
  return fallback.data ?? [];
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

async function loadQuestionActivity(email: string, questionIds: string[]): Promise<QuestionActivity> {
  if (questionIds.length === 0) return emptyActivity(false);
  const attempts = await supabaseAdmin()
    .from("question_bank_attempts")
    .select("question_id,correct")
    .eq("email", email)
    .in("question_id", questionIds)
    .returns<AttemptRow[]>();

  if (!attempts.error) {
    const activity = emptyActivity(true);
    for (const row of attempts.data ?? []) {
      activity.attemptedIds.add(row.question_id);
      const current = activity.attemptsByQuestion.get(row.question_id) ?? { attempts: 0, correct: 0 };
      current.attempts += 1;
      if (row.correct) current.correct += 1;
      activity.attemptsByQuestion.set(row.question_id, current);
    }
    return activity;
  }

  const legacy = await supabaseAdmin()
    .from("drill_question_progress")
    .select("question_id,attempts,mastered_at")
    .eq("email", email)
    .eq("drill_slug", "targeted-math")
    .in("question_id", questionIds)
    .returns<LegacyProgressRow[]>();
  if (legacy.error) throw databaseError("Could not load Math progress", legacy.error);

  const activity = emptyActivity(false);
  for (const row of legacy.data ?? []) {
    activity.attemptedIds.add(row.question_id);
    activity.attemptsByQuestion.set(row.question_id, {
      attempts: row.attempts,
      correct: row.mastered_at ? 1 : 0,
    });
  }
  return activity;
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
    }));
  const byName = new Map(metrics.map((metric) => [metric.name, metric]));

  for (const question of questions) {
    const taxonomy = resolveTaxonomy(question);
    const metric = taxonomy ? byName.get(taxonomy.skill) : undefined;
    if (!metric) continue;
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
