import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAccuracy,
  canAccessQuestionBankLevel,
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
  shouldRevealQuestionBankAnswer,
  sortByOriginalOrder,
} from "./math";

test("math bank filters reject unsupported query values", () => {
  assert.equal(parseDifficultyFilter("hard"), "hard");
  assert.equal(parseDifficultyFilter("impossible"), "all");
  assert.equal(parseCompletionFilter("attempted"), "attempted");
  assert.equal(parseCompletionFilter("correct"), "all");
  assert.equal(parseQuestionLimit("12"), 12);
  assert.equal(parseQuestionLimit("2"), 5);
  assert.equal(parseQuestionLimit("100"), 100);
  assert.equal(parseQuestionLimit("1000"), 500);
  assert.equal(parseQuestionLimit("all"), null);
  assert.equal(parseQuestionLimit(undefined), null);
});

test("an unfiltered 'all topics' session stays capped, but a topic-filtered session is not", () => {
  assert.equal(boundedQuestionBankSessionLimit(null, false), 30);
  assert.equal(boundedQuestionBankSessionLimit(12, false), 12);
  assert.equal(boundedQuestionBankSessionLimit(1_000, false), 30);

  assert.equal(boundedQuestionBankSessionLimit(null, true), 500);
  assert.equal(boundedQuestionBankSessionLimit(12, true), 12);
  assert.equal(boundedQuestionBankSessionLimit(1_000, true), 500);
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

test("challenge source metadata gets its own navigator level", () => {
  assert.equal(questionBankLevel("hard", {
    source: { archivePath: "Math/Challenge Questions/Circles.docx" },
  }), "challenge");
  assert.equal(questionBankLevel("hard", {
    source: { document: "Hard Questions.docx" },
  }), "hard");
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

test("repeating the same wrong response does not burn the retry", () => {
  const first = nextQuestionBankAttemptState(undefined, false, "B");
  const repeat = nextQuestionBankAttemptState(first, false, "B");
  assert.equal(shouldRevealQuestionBankAnswer(false, repeat.incorrectResponses.length), false);

  const second = nextQuestionBankAttemptState(repeat, false, "C");
  assert.equal(shouldRevealQuestionBankAnswer(false, second.incorrectResponses.length), true);
});
