import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPLANATION_MAX_CHARACTERS,
  EXPLANATION_MIN_WORDS,
  countExplanationWords,
  staffExplanationIssue,
} from "./policy";

test("counts explanation words across ordinary whitespace", () => {
  assert.equal(countExplanationWords("  The answer works\n because the two expressions are equal.  "), 9);
  assert.equal(countExplanationWords(""), 0);
});

test("requires at least fifteen words", () => {
  const fourteenWords = Array.from({ length: EXPLANATION_MIN_WORDS - 1 }, () => "word").join(" ");
  const fifteenWords = `${fourteenWords} final`;

  assert.match(staffExplanationIssue(fourteenWords) ?? "", /at least 15 words/i);
  assert.equal(staffExplanationIssue(fifteenWords), null);
});

test("rejects explanations beyond the storage boundary", () => {
  assert.match(staffExplanationIssue("x".repeat(EXPLANATION_MAX_CHARACTERS + 1)) ?? "", /under 20,000 characters/i);
});
