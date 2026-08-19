import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAccuracy,
  nextQuestionBankAttemptState,
  normalizeMathResponse,
  parseCompletionFilter,
  parseDifficultyFilter,
  parseSkillFilter,
  questionBankLevel,
} from "./math";

test("math bank filters reject unsupported query values", () => {
  assert.equal(parseDifficultyFilter("hard"), "hard");
  assert.equal(parseDifficultyFilter("impossible"), "all");
  assert.equal(parseCompletionFilter("attempted"), "attempted");
  assert.equal(parseCompletionFilter("correct"), "all");
});

test("skill filters are trimmed and deduplicated", () => {
  assert.deepEqual(parseSkillFilter("Circles| Percentages |Circles"), ["Circles", "Percentages"]);
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
