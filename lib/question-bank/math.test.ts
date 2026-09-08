import assert from "node:assert/strict";
import { DIFFICULTIES } from "@/lib/sat/types";
import test from "node:test";
import {
  calculateAccuracy,
  canAccessQuestionBankLevel,
  difficultyFilterParam,
  levelMatchesDifficultyFilter,
  nextQuestionBankAttemptState,
  normalizeMathResponse,
  parseCompletionFilter,
  parseDifficultyFilter,
  parseQuestionLimit,
  boundedQuestionBankSessionLimit,
  parseSkillFilter,
  prioritizeBoundedQuestions,
  prioritizeUnattemptedQuestions,
  questionBankLevel,
  selectQuestionBankSession,
  skillMetricForDifficulty,
  shouldRevealQuestionBankAnswer,
  sortByOriginalOrder,
} from "./math";

test("math bank filters reject unsupported query values", () => {
  assert.deepEqual(parseDifficultyFilter("hard"), ["hard"]);
  assert.deepEqual(parseDifficultyFilter("impossible"), []);
  assert.equal(parseCompletionFilter("attempted"), "attempted");
  assert.equal(parseCompletionFilter("correct"), "all");
  assert.equal(parseQuestionLimit("12"), 12);
  assert.equal(parseQuestionLimit("2"), 5);
  assert.equal(parseQuestionLimit("100"), 100);
  assert.equal(parseQuestionLimit("1000"), 500);
  assert.equal(parseQuestionLimit("all"), null);
  assert.equal(parseQuestionLimit(undefined), null);
});

// "Start all topics" was capped at 30 while a topic-filtered session got 500,
// so choosing the whole bank returned the smallest session in the app and the
// student's difficulty and completion filters were applied to 30 questions
// with the rest discarded. Every session now shares one ceiling.
test("a session takes everything that matched, whether or not a topic is chosen", () => {
  assert.equal(boundedQuestionBankSessionLimit(null), 500);
  assert.equal(boundedQuestionBankSessionLimit(1_000), 500);

  // An explicit limit is still honoured -- the study planner asks for exact
  // set sizes and must keep getting them.
  assert.equal(boundedQuestionBankSessionLimit(12), 12);
  assert.equal(boundedQuestionBankSessionLimit(1), 1);
});

test("bounded sessions advance unseen questions before recycling attempted ones", () => {
  const questions = [{ id: "seen-1" }, { id: "new-1" }, { id: "seen-2" }, { id: "new-2" }];
  assert.deepEqual(
    prioritizeUnattemptedQuestions(questions, new Set(["seen-1", "seen-2"])).map(({ id }) => id),
    ["new-1", "new-2", "seen-1", "seen-2"],
  );
});

test("sortByOriginalOrder restores creation order after attempt-based prioritization", () => {
  const order = new Map([["a", 0], ["b", 1], ["c", 2], ["d", 3]]);
  const prioritized = prioritizeUnattemptedQuestions(
    [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    new Set(["a", "c"]),
  );
  assert.deepEqual(prioritized.map(({ id }) => id), ["b", "d", "a", "c"]);
  assert.deepEqual(
    sortByOriginalOrder(prioritized, order).map(({ id }) => id),
    ["a", "b", "c", "d"],
  );
});

test("skill filters are trimmed and deduplicated", () => {
  assert.deepEqual(parseSkillFilter("Circles| Percentages |Circles"), ["Circles", "Percentages"]);
});

test("bounded planner sessions preserve preferred questions and backfill without duplicates", () => {
  const preferred = [{ id: "easy-1" }, { id: "easy-2" }];
  const sameCompletion = [{ id: "easy-1" }, { id: "medium-1" }];
  const wholeSkill = [{ id: "easy-2" }, { id: "hard-1" }, { id: "seen-1" }];

  assert.deepEqual(
    prioritizeBoundedQuestions([preferred, sameCompletion, wholeSkill], 5).map((question) => question.id),
    ["easy-1", "easy-2", "medium-1", "hard-1", "seen-1"],
  );
});

test("bounded all-topic sessions include a visual question when one exists", () => {
  const questions = [
    { id: "one", figureUrl: null },
    { id: "two", figureUrl: null },
    { id: "three", figureUrl: null },
    { id: "visual", figureUrl: "https://example.com/figure.png" },
  ];

  assert.deepEqual(
    selectQuestionBankSession(questions, 3).map((question) => question.id),
    ["one", "two", "visual"],
  );
  assert.deepEqual(
    selectQuestionBankSession([questions[3], ...questions], 3).map((question) => question.id),
    ["visual", "one", "two"],
  );
  assert.deepEqual(
    selectQuestionBankSession(questions, 3, new Set(["visual"])).map((question) => question.id),
    ["one", "two", "three"],
  );
});

test("math responses normalize without changing fractions or decimals", () => {
  assert.equal(normalizeMathResponse(" + 3 / 2 "), "3/2");
  assert.equal(normalizeMathResponse(" -1.25 "), "-1.25");
});

test("accuracy is absent until there is an attempt", () => {
  assert.equal(calculateAccuracy(0, 0), null);
  assert.equal(calculateAccuracy(7, 9), 78);
});

test("a correct retry preserves the earlier incorrect attempt", () => {
  const incorrect = nextQuestionBankAttemptState(undefined, false, "2");
  const corrected = nextQuestionBankAttemptState(incorrect, true, "3");

  assert.deepEqual(corrected, {
    correct: true,
    response: "3",
    hadIncorrectAttempt: true,
    incorrectResponses: ["2"],
  });
});

// A question demoted out of Challenge keeps the challenge string in its source
// archive forever, so deriving the level from that source made the demotion
// impossible: the question snapped back to Challenge in the filter and in every
// level grouping. The stored tier is the only input.
test("the level is the stored difficulty, whatever the source archive says", () => {
  for (const difficulty of DIFFICULTIES) {
    assert.equal(questionBankLevel(difficulty), difficulty);
  }
});

test("free access excludes Challenge questions while paid access includes them", () => {
  assert.equal(canAccessQuestionBankLevel("challenge", false), false);
  assert.equal(canAccessQuestionBankLevel("challenge", true), true);
  assert.equal(canAccessQuestionBankLevel("hard", false), true);
});

test("a missed question withholds its solution until a second wrong response", () => {
  assert.equal(shouldRevealQuestionBankAnswer(false, 1), false);
  assert.equal(shouldRevealQuestionBankAnswer(false, 2), true);
  assert.equal(shouldRevealQuestionBankAnswer(false, 3), true);
  assert.equal(shouldRevealQuestionBankAnswer(true, 0), true);
  assert.equal(shouldRevealQuestionBankAnswer(true, 1), true);
});

test("free response reveals after the same wrong value is sent twice", () => {
  // Counted as "total" server-side for grid-ins: there is no wrong-choice list
  // to cross off, so a student stuck on one value must still reach the answer.
  assert.equal(shouldRevealQuestionBankAnswer(false, 1), false);
  assert.equal(shouldRevealQuestionBankAnswer(false, 2), true);
});

test("repeating the same wrong choice does not burn a multiple-choice retry", () => {
  const first = nextQuestionBankAttemptState(undefined, false, "B");
  const repeat = nextQuestionBankAttemptState(first, false, "B");
  assert.equal(shouldRevealQuestionBankAnswer(false, repeat.incorrectResponses.length), false);

  const second = nextQuestionBankAttemptState(repeat, false, "C");
  assert.equal(shouldRevealQuestionBankAnswer(false, second.incorrectResponses.length), true);
});

/* --------------------------- Combined difficulty --------------------------- */

test("difficulty levels combine, and old single-value links still work", () => {
  assert.deepEqual(parseDifficultyFilter("hard|challenge"), ["hard", "challenge"]);
  // Links written before levels could be combined, including the study
  // planner's generated hrefs.
  assert.deepEqual(parseDifficultyFilter("easy"), ["easy"]);
  assert.deepEqual(parseDifficultyFilter("all"), []);
  assert.deepEqual(parseDifficultyFilter(undefined), []);
  assert.deepEqual(parseDifficultyFilter(""), []);
});

test("a difficulty list is cleaned up rather than trusted", () => {
  assert.deepEqual(parseDifficultyFilter("hard|hard|challenge"), ["hard", "challenge"]);
  assert.deepEqual(parseDifficultyFilter(" hard | challenge "), ["hard", "challenge"]);
  assert.deepEqual(parseDifficultyFilter("hard|impossible"), ["hard"]);
  assert.deepEqual(parseDifficultyFilter("impossible|nonsense"), []);
});

test("a filter naming every level is written as no filter at all", () => {
  assert.equal(difficultyFilterParam([]), null);
  assert.equal(difficultyFilterParam(["easy", "medium", "hard", "challenge"]), null);
  // Always in level order, so the same selection makes the same URL.
  assert.equal(difficultyFilterParam(["challenge", "hard"]), "hard|challenge");
});

test("a level always matches an empty filter and only itself otherwise", () => {
  assert.equal(levelMatchesDifficultyFilter("easy", []), true);
  assert.equal(levelMatchesDifficultyFilter("easy", ["hard", "challenge"]), false);
  assert.equal(levelMatchesDifficultyFilter("challenge", ["hard", "challenge"]), true);
});

// Challenge questions are carved out of their nominal difficulty bucket, so
// combining levels is a plain sum -- nothing is counted twice, and the accuracy
// is recomputed from the tallies rather than averaged from percentages.
test("a combined selection sums its levels and recomputes one accuracy", () => {
  const metric = {
    available: 100,
    attempted: 40,
    saved: 0,
    savedAttempted: 0,
    accuracy: 70,
    byLevel: {
      easy: { available: 40, attempted: 20, saved: 0, savedAttempted: 0, attempts: 20, correct: 18, accuracy: 90 },
      medium: { available: 30, attempted: 10, saved: 0, savedAttempted: 0, attempts: 10, correct: 7, accuracy: 70 },
      hard: { available: 20, attempted: 6, saved: 0, savedAttempted: 0, attempts: 10, correct: 5, accuracy: 50 },
      challenge: { available: 10, attempted: 4, saved: 0, savedAttempted: 0, attempts: 10, correct: 1, accuracy: 10 },
    },
  };

  const combined = skillMetricForDifficulty(metric, ["hard", "challenge"]);
  assert.equal(combined.available, 30);
  assert.equal(combined.attempted, 10);
  // 6 correct from 20 attempts, not the 30% that averaging 50 and 10 would give.
  assert.equal(combined.accuracy, 30);

  assert.deepEqual(skillMetricForDifficulty(metric, []), { available: 100, attempted: 40, accuracy: 70 });
  // A single level is the bucket's own numbers, accuracy included.
  assert.deepEqual(skillMetricForDifficulty(metric, ["hard"]), { available: 20, attempted: 6, accuracy: 50 });
});

test("a combined selection with no attempts reports no accuracy", () => {
  const metric = {
    available: 10,
    attempted: 0,
    saved: 0,
    savedAttempted: 0,
    accuracy: null,
    byLevel: {
      easy: { available: 5, attempted: 0, saved: 0, savedAttempted: 0, attempts: 0, correct: 0, accuracy: null },
      medium: { available: 5, attempted: 0, saved: 0, savedAttempted: 0, attempts: 0, correct: 0, accuracy: null },
      hard: { available: 0, attempted: 0, saved: 0, savedAttempted: 0, attempts: 0, correct: 0, accuracy: null },
      challenge: { available: 0, attempted: 0, saved: 0, savedAttempted: 0, attempts: 0, correct: 0, accuracy: null },
    },
  };

  assert.equal(skillMetricForDifficulty(metric, ["easy", "medium"]).accuracy, null);
});

// The marked-for-review toggle narrows the pool the same way difficulty does,
// so the catalog's counts have to compose the two rather than showing a total
// the session would never hand back.
test("marked-for-review counts compose with the difficulty filter", () => {
  const metric = {
    available: 100,
    attempted: 40,
    saved: 12,
    savedAttempted: 5,
    accuracy: 70,
    byLevel: {
      easy: { available: 40, attempted: 20, saved: 2, savedAttempted: 1, attempts: 20, correct: 18, accuracy: 90 },
      medium: { available: 30, attempted: 10, saved: 3, savedAttempted: 1, attempts: 10, correct: 7, accuracy: 70 },
      hard: { available: 20, attempted: 6, saved: 5, savedAttempted: 2, attempts: 10, correct: 5, accuracy: 50 },
      challenge: { available: 10, attempted: 4, saved: 2, savedAttempted: 1, attempts: 10, correct: 1, accuracy: 10 },
    },
  };

  // Off, nothing changes.
  assert.deepEqual(skillMetricForDifficulty(metric, []), { available: 100, attempted: 40, accuracy: 70 });

  // On with no difficulty chosen: the skill's marked tally, not its full one.
  assert.deepEqual(skillMetricForDifficulty(metric, [], true), { available: 12, attempted: 5, accuracy: 70 });

  // On with a difficulty chosen: marked *and* hard, not all hard and not all marked.
  assert.deepEqual(skillMetricForDifficulty(metric, ["hard"], true), { available: 5, attempted: 2, accuracy: 50 });

  // Combined levels still sum, and still only the marked ones.
  const combined = skillMetricForDifficulty(metric, ["hard", "challenge"], true);
  assert.equal(combined.available, 7);
  assert.equal(combined.attempted, 3);
});

test("a skill with nothing marked reports no questions rather than its full count", () => {
  const metric = {
    available: 25,
    attempted: 9,
    saved: 0,
    savedAttempted: 0,
    accuracy: 60,
    byLevel: {
      easy: { available: 25, attempted: 9, saved: 0, savedAttempted: 0, attempts: 9, correct: 5, accuracy: 60 },
      medium: { available: 0, attempted: 0, saved: 0, savedAttempted: 0, attempts: 0, correct: 0, accuracy: null },
      hard: { available: 0, attempted: 0, saved: 0, savedAttempted: 0, attempts: 0, correct: 0, accuracy: null },
      challenge: { available: 0, attempted: 0, saved: 0, savedAttempted: 0, attempts: 0, correct: 0, accuracy: null },
    },
  };
  assert.equal(skillMetricForDifficulty(metric, [], true).available, 0);
  assert.equal(skillMetricForDifficulty(metric, ["easy"], true).available, 0);
  assert.equal(skillMetricForDifficulty(metric, [], false).available, 25);
});
