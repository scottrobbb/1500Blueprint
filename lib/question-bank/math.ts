import type { ChoiceId, Difficulty } from "@/lib/sat/types";

export const MATH_DOMAINS = [
  "Algebra",
  "Advanced Math",
  "Problem-Solving and Data Analysis",
  "Geometry and Trigonometry",
] as const;

export type MathDomain = (typeof MATH_DOMAINS)[number];
export type MathDifficultyFilter = Difficulty | "all";
export type MathCompletionFilter = "all" | "unanswered" | "attempted";
export type MathAnswerType = "mc_single" | "grid_in";
export type QuestionBankLevel = Difficulty | "challenge";

// Applies only when no skill is selected ("Start all topics") — an unfocused
// session across the whole bank still needs a sane size. A skill-filtered
// session (clicking one or more specific topics) should include everything
// available for that topic, up to MAX_FILTERED_QUESTION_BANK_SESSION_QUESTIONS.
export const MAX_QUESTION_BANK_SESSION_QUESTIONS = 30;
export const MAX_FILTERED_QUESTION_BANK_SESSION_QUESTIONS = 500;

export type MathChoice = {
  id: ChoiceId;
  text: string;
};

export type MathSkillMetric = {
  domain: MathDomain;
  name: string;
  sort: number;
  available: number;
  attempted: number;
  attempts: number;
  correct: number;
  accuracy: number | null;
};

export type MathBankCatalog = {
  totalAvailable: number;
  totalAttempted: number;
  skills: MathSkillMetric[];
};

export type MathRunnerQuestion = {
  id: string;
  domain: MathDomain;
  skill: string;
  difficulty: Difficulty;
  level: QuestionBankLevel;
  answerType: MathAnswerType;
  prompt: string;
  passage: string | null;
  figureUrl: string | null;
  choices: MathChoice[];
};

export type QuestionBankAttemptState = {
  correct: boolean;
  response: string;
  hadIncorrectAttempt: boolean;
  incorrectResponses: string[];
};

export type QuestionBankRunnerState = {
  attempts: Record<string, QuestionBankAttemptState>;
  savedQuestionIds: string[];
};

export type MathAttemptResult = {
  correct: boolean;
  explanation: string;
  correctAnswer: string;
};

export function isMathDomain(value: string | null): value is MathDomain {
  return MATH_DOMAINS.some((domain) => domain === value);
}

export function parseDifficultyFilter(value: string | undefined): MathDifficultyFilter {
  return value === "easy" || value === "medium" || value === "hard" ? value : "all";
}

export function parseCompletionFilter(value: string | undefined): MathCompletionFilter {
  return value === "unanswered" || value === "attempted" ? value : "all";
}

export function parseSkillFilter(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split("|").map((skill) => skill.trim()).filter(Boolean))];
}

export function parseQuestionLimit(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(5, Math.min(MAX_FILTERED_QUESTION_BANK_SESSION_QUESTIONS, parsed)) : null;
}

export function boundedQuestionBankSessionLimit(value: number | null, hasSkillFilter: boolean): number {
  const ceiling = hasSkillFilter ? MAX_FILTERED_QUESTION_BANK_SESSION_QUESTIONS : MAX_QUESTION_BANK_SESSION_QUESTIONS;
  if (value === null) return ceiling;
  return Math.max(1, Math.min(Math.floor(value), ceiling));
}

export function prioritizeUnattemptedQuestions<T extends { id: string }>(
  questions: T[],
  attemptedIds: ReadonlySet<string>,
): T[] {
  return questions
    .map((question, index) => ({
      question,
      index,
      attempted: attemptedIds.has(question.id) ? 1 : 0,
    }))
    .sort((a, b) => a.attempted - b.attempted || a.index - b.index)
    .map(({ question }) => question);
}

export function prioritizeBoundedQuestions<T extends { id: string }>(
  groups: T[][],
  limit: number,
): T[] {
  const questions: T[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const question of group) {
      if (seen.has(question.id)) continue;
      seen.add(question.id);
      questions.push(question);
      if (questions.length === limit) return questions;
    }
  }
  return questions;
}

export function selectQuestionBankSession<T extends { id: string; figureUrl: string | null }>(
  questions: T[],
  limit: number,
  attemptedIds: ReadonlySet<string> = new Set(),
): T[] {
  const selected = questions.slice(0, limit);
  if (selected.length === 0 || selected.some((question) => question.figureUrl)) {
    return selected;
  }

  const visualSlot = Math.min(9, selected.length - 1);
  const replacementAttempted = attemptedIds.has(selected[visualSlot].id);
  const visualQuestion = questions.slice(limit).find((question) => (
    question.figureUrl && attemptedIds.has(question.id) === replacementAttempted
  ));
  if (!visualQuestion) return selected;

  selected[visualSlot] = visualQuestion;
  return selected;
}

export function normalizeMathResponse(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/^\+/, "");
}

export function calculateAccuracy(correct: number, attempts: number): number | null {
  if (attempts === 0) return null;
  return Math.round((correct / attempts) * 100);
}

export function nextQuestionBankAttemptState(
  previous: QuestionBankAttemptState | undefined,
  correct: boolean,
  response: string,
): QuestionBankAttemptState {
  const incorrectResponses = previous?.incorrectResponses ?? [];
  return {
    correct,
    response,
    hadIncorrectAttempt: previous?.hadIncorrectAttempt === true || !correct,
    incorrectResponses: !correct && !incorrectResponses.includes(response)
      ? [...incorrectResponses, response]
      : incorrectResponses,
  };
}

export function formatDifficulty(difficulty: Difficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export function questionBankLevel(
  difficulty: Difficulty,
  content: Record<string, unknown> | null,
): QuestionBankLevel {
  const source = isRecord(content?.source) ? content.source : null;
  const sourceLabel = source
    ? `${stringValue(source.archivePath)} ${stringValue(source.document)}`
    : "";
  return /challenge/i.test(sourceLabel) ? "challenge" : difficulty;
}

export function canAccessQuestionBankLevel(level: QuestionBankLevel, challengeQuestions: boolean): boolean {
  return level !== "challenge" || challengeQuestions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
