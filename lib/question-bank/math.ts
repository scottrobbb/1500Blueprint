import type { ChoiceId, Difficulty } from "@/lib/sat/types";

export const MATH_DOMAINS = [
  "Algebra",
  "Advanced Math",
  "Problem-Solving and Data Analysis",
  "Geometry and Trigonometry",
] as const;

export type MathDomain = (typeof MATH_DOMAINS)[number];
// Challenge is now one of the stored Difficulty values, so a level is just a
// difficulty. The alias is kept because catalog and filter code reads better
// in terms of "level".
export type QuestionBankLevel = Difficulty;
export type MathDifficultyFilter = QuestionBankLevel | "all";
export type MathCompletionFilter = "all" | "unanswered" | "attempted";
export type MathAnswerType = "mc_single" | "grid_in";

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

export type QuestionBankLevelBreakdown = Record<QuestionBankLevel, {
  available: number;
  attempted: number;
  accuracy: number | null;
}>;

export type MathSkillMetric = {
  domain: MathDomain;
  name: string;
  sort: number;
  available: number;
  attempted: number;
  attempts: number;
  correct: number;
  accuracy: number | null;
  byLevel: QuestionBankLevelBreakdown;
};

export function emptyLevelBreakdown(): QuestionBankLevelBreakdown {
  return {
    easy: { available: 0, attempted: 0, accuracy: null },
    medium: { available: 0, attempted: 0, accuracy: null },
    hard: { available: 0, attempted: 0, accuracy: null },
    challenge: { available: 0, attempted: 0, accuracy: null },
  };
}

// A skill row's overview numbers (progress bar, accuracy dot) should reflect
// whichever difficulty/level the catalog page's filter is set to, not always
// the skill's all-difficulty total. Challenge questions are carved out of
// their nominal difficulty bucket into their own "challenge" level, so
// selecting "Hard" never double-counts them alongside selecting "Challenge".
export function skillMetricForDifficulty(
  metric: { available: number; attempted: number; accuracy: number | null; byLevel: QuestionBankLevelBreakdown },
  difficulty: MathDifficultyFilter,
): { available: number; attempted: number; accuracy: number | null } {
  if (difficulty === "all") return { available: metric.available, attempted: metric.attempted, accuracy: metric.accuracy };
  return metric.byLevel[difficulty];
}

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

// Missing a question should send the student back to it rather than straight
// to the solution. The correct answer and explanation stay hidden until they
// have spent this many distinct wrong responses on it.
export const QUESTION_BANK_WRONG_ANSWERS_BEFORE_REVEAL = 2;

export type QuestionBankAttemptState = {
  correct: boolean;
  response: string;
  hadIncorrectAttempt: boolean;
  incorrectResponses: string[];
};

// Whether a question was answered right last time, with no record of which
// choice was picked. That split is the whole point: the outcome is what the
// navigator marks a question with, while the chosen answer and the set of
// wrong choices are what would give the answer away on a re-attempt. Only the
// outcome crosses between sittings.
export type QuestionBankOutcome = {
  correct: boolean;
  hadIncorrectAttempt: boolean;
};

export type QuestionBankRunnerState = {
  // Per question, from the student's whole history. Safe to render: it names
  // no choice, so three wrong attempts still do not identify the fourth.
  outcomes: Record<string, QuestionBankOutcome>;
  savedQuestionIds: string[];
};

export type MathAttemptResult = {
  correct: boolean;
  // False while the student still has a retry left on a missed question --
  // explanation and correctAnswer are withheld from the response entirely in
  // that case, so the answer can't be read out of the network payload either.
  revealed: boolean;
  explanation: string;
  correctAnswer: string;
};

export function isMathDomain(value: string | null): value is MathDomain {
  return MATH_DOMAINS.some((domain) => domain === value);
}

export function parseDifficultyFilter(value: string | undefined): MathDifficultyFilter {
  return value === "easy" || value === "medium" || value === "hard" || value === "challenge" ? value : "all";
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

// A narrowing completion filter is a constraint, not a preference. The runner
// used to top a short session back up to its full size by relaxing this filter,
// so choosing "Unattempted" and having fewer than a session's worth left handed
// the student attempted questions anyway -- in the runner and in the panel.
// A filtered session is allowed to be short.
export function questionsMatchingCompletion<T extends { id: string }>(
  rows: readonly T[],
  completion: MathCompletionFilter,
  attemptedIds: ReadonlySet<string>,
): T[] {
  if (completion === "all") return [...rows];
  const wantAttempted = completion === "attempted";
  return rows.filter((row) => attemptedIds.has(row.id) === wantAttempted);
}

// The whole selection for one session: honour the completion filter, put unseen
// questions first so a truncated session spends its slots on them, then cut to
// size. Shared so the math and Reading & Writing runners cannot drift apart.
export function questionBankSession<T extends { id: string; figureUrl: string | null }>(
  rows: readonly T[],
  completion: MathCompletionFilter,
  attemptedIds: ReadonlySet<string>,
  sessionLimit: number,
): T[] {
  const matching = questionsMatchingCompletion(rows, completion, attemptedIds);
  return selectQuestionBankSession(
    prioritizeUnattemptedQuestions(matching, attemptedIds),
    sessionLimit,
    attemptedIds,
  );
}

// How a session relates to a question set that has already been handed out.
// A Study Planner task promises one fixed set -- the student is meant to come
// back to the same 15 questions, not to a fresh 15 -- so the task pins its ids
// the first time it is opened and replays them afterwards.
export type QuestionBankSessionPin =
  | { mode: "replay"; questionIds: readonly string[] }
  | { mode: "resume"; questionIds: readonly string[] };

// Replay: rebuild the session from pinned ids, in the order they were pinned,
// dropping any question that has since left the bank. The completion filter and
// the session limit are deliberately not consulted -- they chose the set once.
export function pinnedQuestionBankSession<T extends { id: string }>(
  rows: readonly T[],
  pinnedIds: readonly string[],
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return pinnedIds
    .map((id) => byId.get(id))
    .filter((row): row is T => row !== undefined);
}

// Resume: the first open of a task the student has already worked, either
// before pinning shipped or straight from the Question Bank. Questions they
// have already answered for the task open the session so that work is still
// theirs, and the normal selection fills whatever slots are left.
export function resumedQuestionBankSession<T extends { id: string; figureUrl: string | null }>(
  carriedRows: readonly T[],
  rows: readonly T[],
  completion: MathCompletionFilter,
  attemptedIds: ReadonlySet<string>,
  sessionLimit: number,
): T[] {
  const carried = carriedRows.slice(0, sessionLimit);
  const carriedIds = new Set(carried.map((row) => row.id));
  return [
    ...carried,
    ...questionBankSession(
      rows.filter((row) => !carriedIds.has(row.id)),
      completion,
      attemptedIds,
      sessionLimit - carried.length,
    ),
  ];
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

// prioritizeUnattemptedQuestions/selectQuestionBankSession bias which
// questions make it into a size-capped session toward unattempted ones --
// but once the set is chosen, the student sees stable, numbered slots in
// the Question Bank panel (colored by completion, not by position), so the
// displayed order should never depend on attempt status. Restore the
// original (creation-order) sequence right before returning.
export function sortByOriginalOrder<T extends { id: string }>(
  questions: T[],
  order: ReadonlyMap<string, number>,
): T[] {
  return [...questions].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function normalizeMathResponse(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/^\+/, "");
}

export function calculateAccuracy(correct: number, attempts: number): number | null {
  if (attempts === 0) return null;
  return Math.round((correct / attempts) * 100);
}

export function shouldRevealQuestionBankAnswer(
  correct: boolean,
  wrongResponseCount: number,
): boolean {
  return correct || wrongResponseCount >= QUESTION_BANK_WRONG_ANSWERS_BEFORE_REVEAL;
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

// The stored difficulty is the only source of truth for a question's bank
// level. This used to fall back to sniffing content.source for "challenge",
// from when the tier was derived rather than stored. That fallback outlived
// its purpose the moment the backfill ran, and it silently overrode admin
// edits: a question demoted out of Challenge keeps its challenge source
// string, so it snapped straight back to Challenge in the filter and in every
// level grouping. It takes no content for that reason -- there is nothing
// left to derive from.
export function questionBankLevel(difficulty: Difficulty): QuestionBankLevel {
  return difficulty;
}

export function canAccessQuestionBankLevel(level: QuestionBankLevel, challengeQuestions: boolean): boolean {
  return level !== "challenge" || challengeQuestions;
}
