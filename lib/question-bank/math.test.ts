import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAccuracy,
  normalizeMathResponse,
  parseCompletionFilter,
  parseDifficultyFilter,
  parseSkillFilter,
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
