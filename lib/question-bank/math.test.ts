import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAccuracy,
  nextQuestionBankAttemptState,
  normalizeMathResponse,
  parseCompletionFilter,
  parseDifficultyFilter,
  parseQuestionLimit,
  parseSkillFilter,
  prioritizeBoundedQuestions,
  questionBankLevel,
} from "./math";

test("math bank filters reject unsupported query values", () => {
  assert.equal(parseDifficultyFilter("hard"), "hard");
  assert.equal(parseDifficultyFilter("impossible"), "all");
  assert.equal(parseCompletionFilter("attempted"), "attempted");
  assert.equal(parseCompletionFilter("correct"), "all");
  assert.equal(parseQuestionLimit("12"), 12);
  assert.equal(parseQuestionLimit("2"), 5);
  assert.equal(parseQuestionLimit("100"), 30);
  assert.equal(parseQuestionLimit("all"), null);
  assert.equal(parseQuestionLimit(undefined), null);
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
