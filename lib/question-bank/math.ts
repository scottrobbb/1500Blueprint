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
// Levels can be combined -- a student revising hard questions usually wants
// challenge ones in the same session. Empty means every level, which is what
// an absent or unrecognised filter falls back to.
export type MathDifficultyFilter = readonly QuestionBankLevel[];
export type MathCompletionFilter = "all" | "unanswered" | "attempted" | "incorrect";
export type MathAnswerType = "mc_single" | "grid_in";

// One ceiling for every session. "Start all topics" used to be capped at 30
// separately, on the reasoning that an unfocused session needs a sane size --
// but a student who picks that has asked for the whole bank, and the filters
// they set are what narrows it. The cap only meant their difficulty and
// completion choices were applied to 30 questions and the rest thrown away.
// This remains a ceiling rather than no limit: the whole session is rendered
// into the runner at once.
export const MAX_QUESTION_BANK_SESSION_QUESTIONS = 500;

export type MathChoice = {
  id: ChoiceId;
  text: string;
};

export type QuestionBankLevelBreakdown = Record<QuestionBankLevel, {
  available: number;
  attempted: number;
  // Raw tallies, kept so a combined selection can compute one exact accuracy
  // instead of averaging percentages that each mean something different.
  attempts: number;
  correct: number;
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

export const QUESTION_BANK_LEVELS = ["easy", "medium", "hard", "challenge"] as const;

export function emptyLevelBreakdown(): QuestionBankLevelBreakdown {
  return {
    easy: { available: 0, attempted: 0, attempts: 0, correct: 0, accuracy: null },
    medium: { available: 0, attempted: 0, attempts: 0, correct: 0, accuracy: null },
    hard: { available: 0, attempted: 0, attempts: 0, correct: 0, accuracy: null },
    challenge: { available: 0, attempted: 0, attempts: 0, correct: 0, accuracy: null },
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
  if (difficulty.length === 0) {
    return { available: metric.available, attempted: metric.attempted, accuracy: metric.accuracy };
  }
  // Levels are disjoint -- challenge is carved out of its nominal difficulty
  // bucket -- so combining them is a plain sum with nothing counted twice, and
  // the accuracy comes from the summed tallies rather than an average of
  // percentages weighted by nothing.
  let available = 0;
  let attempted = 0;
  let attempts = 0;
  let correct = 0;
  let sawAccuracy = false;
  for (const level of new Set(difficulty)) {
    const bucket = metric.byLevel[level];
    available += bucket.available;
    attempted += bucket.attempted;
    attempts += bucket.attempts;
    correct += bucket.correct;
    if (bucket.accuracy !== null) sawAccuracy = true;
  }
  return {
    available,
    attempted,
    accuracy: sawAccuracy && attempts > 0 ? calculateAccuracy(correct, attempts) : null,
  };
}

export function isQuestionBankLevel(value: string): value is QuestionBankLevel {
  return (QUESTION_BANK_LEVELS as readonly string[]).includes(value);
}

// Selected levels match a question when the filter names its level; an empty
// filter matches everything.
export function levelMatchesDifficultyFilter(
  level: QuestionBankLevel,
  difficulty: MathDifficultyFilter,
): boolean {
  return difficulty.length === 0 || difficulty.includes(level);
}

export type MathBankCatalog = {
  totalAvailable: number;
  totalAttempted: number;
  // Marked questions still visible to this student: saves are kept per email
  // and never pruned, so a question that has since left the bank or sits
  // outside a free plan's pool must not be counted here.
  totalSaved: number;
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

// Reads both the pipe-separated list this writes today and the single value
// links written before levels could be combined, so old bookmarks and the
// study planner's generated hrefs keep working. "all", empty and unrecognised
// values all mean no restriction.
export function parseDifficultyFilter(value: string | undefined): MathDifficultyFilter {
  if (!value) return [];
  const levels = value
    .split("|")
    .map((level) => level.trim())
    .filter(isQuestionBankLevel);
  return [...new Set(levels)];
}

export function difficultyFilterParam(difficulty: MathDifficultyFilter): string | null {
  const levels = QUESTION_BANK_LEVELS.filter((level) => difficulty.includes(level));
  return levels.length === 0 || levels.length === QUESTION_BANK_LEVELS.length
    ? null
    : levels.join("|");
}

export function parseCompletionFilter(value: string | undefined): MathCompletionFilter {
  return value === "unanswered" || value === "attempted" || value === "incorrect" ? value : "all";
}

// Handed to questionsMatchingSaved when the filter is off, so the saved-ids
// query is skipped entirely rather than run and ignored.
export const EMPTY_SAVED_IDS: ReadonlySet<string> = new Set();

// Marked-for-review is its own dimension rather than another completion value:
// a marked question may be unanswered, answered, or still wrong, so folding it
// into that list would make two independent choices mutually exclusive.
export function parseSavedFilter(value: string | undefined): boolean {
  return value === "1";
}

// Applied before the completion filter and the session cut, so "marked" narrows
// the pool the rest of the filters then work over.
export function questionsMatchingSaved<T extends { id: string }>(
  rows: readonly T[],
  savedOnly: boolean,
  savedIds: ReadonlySet<string>,
): T[] {
  if (!savedOnly) return [...rows];
  return rows.filter((row) => savedIds.has(row.id));
}

export function parseSkillFilter(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split("|").map((skill) => skill.trim()).filter(Boolean))];
}

export function parseQuestionLimit(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(5, Math.min(MAX_QUESTION_BANK_SESSION_QUESTIONS, parsed)) : null;
}

// No explicit limit means "everything that matched", up to the ceiling. An
// explicit one -- the study planner asks for exact set sizes -- is honoured.
export function boundedQuestionBankSessionLimit(value: number | null): number {
  if (value === null) return MAX_QUESTION_BANK_SESSION_QUESTIONS;
  return Math.max(1, Math.min(Math.floor(value), MAX_QUESTION_BANK_SESSION_QUESTIONS));
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
export type QuestionBankActivity = {
  attemptedIds: ReadonlySet<string>;
  // Answered at least once and never once answered correctly. A question the
  // student later gets right leaves this set, which is what makes it a review
  // queue rather than a permanent record of every miss.
  incorrectIds: ReadonlySet<string>;
};

// The still-wrong questions, derived from the per-question attempt tallies both
// subjects already load. Kept here so math and Reading & Writing cannot decide
// "incorrect" differently.
export function incorrectQuestionIds(
  attemptsByQuestion: ReadonlyMap<string, { attempts: number; correct: number }>,
): Set<string> {
  const incorrect = new Set<string>();
  for (const [questionId, tally] of attemptsByQuestion) {
    if (tally.attempts > 0 && tally.correct === 0) incorrect.add(questionId);
  }
  return incorrect;
}

export function questionsMatchingCompletion<T extends { id: string }>(
  rows: readonly T[],
  completion: MathCompletionFilter,
  activity: QuestionBankActivity,
): T[] {
  if (completion === "all") return [...rows];
  // "Incorrect" is a subset of "attempted", not a fourth exclusive bucket: a
  // question the student got wrong is still one they have seen.
  if (completion === "incorrect") return rows.filter((row) => activity.incorrectIds.has(row.id));
  const wantAttempted = completion === "attempted";
  return rows.filter((row) => activity.attemptedIds.has(row.id) === wantAttempted);
}

// The whole selection for one session: honour the completion filter, put unseen
// questions first so a truncated session spends its slots on them, then cut to
// size. Shared so the math and Reading & Writing runners cannot drift apart.
export function questionBankSession<T extends { id: string; figureUrl: string | null }>(
  rows: readonly T[],
  completion: MathCompletionFilter,
  activity: QuestionBankActivity,
  sessionLimit: number,
): T[] {
  const matching = questionsMatchingCompletion(rows, completion, activity);
  return selectQuestionBankSession(
    prioritizeUnattemptedQuestions(matching, activity.attemptedIds),
    sessionLimit,
    activity.attemptedIds,
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
  activity: QuestionBankActivity,
  sessionLimit: number,
): T[] {
  const carried = carriedRows.slice(0, sessionLimit);
  const carriedIds = new Set(carried.map((row) => row.id));
  return [
    ...carried,
    ...questionBankSession(
      rows.filter((row) => !carriedIds.has(row.id)),
      completion,
      activity,
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
