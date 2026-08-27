import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPLANATION_MAX_CHARACTERS,
  EXPLANATION_MIN_WORDS,
  countExplanationWords,
  staffExplanationIssue,
  staffQuestionChoiceIssue,
  staffQuestionPassageIssue,
  staffQuestionPromptIssue,
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

test("rejects a blank or oversized question prompt, accepts a normal one", () => {
  assert.match(staffQuestionPromptIssue("   ") ?? "", /cannot be blank/i);
  assert.match(staffQuestionPromptIssue("x".repeat(20_001)) ?? "", /under 20,000 characters/i);
  assert.equal(staffQuestionPromptIssue("What is the value of x?"), null);
});

test("allows an empty passage but rejects an oversized one", () => {
  assert.equal(staffQuestionPassageIssue(""), null);
  assert.match(staffQuestionPassageIssue("x".repeat(50_001)) ?? "", /under 50,000 characters/i);
});

test("rejects a blank or oversized choice, accepts a normal one", () => {
  assert.match(staffQuestionChoiceIssue("") ?? "", /cannot be blank/i);
  assert.match(staffQuestionChoiceIssue("x".repeat(5_001)) ?? "", /under 5,000 characters/i);
  assert.equal(staffQuestionChoiceIssue("An equivalent expression"), null);
});
