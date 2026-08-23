import assert from "node:assert/strict";
import test from "node:test";
import {
  isQuestionBankEligibleShape,
  isQuestionBankRuntimeReady,
  questionBankPublishabilityIssue,
} from "./eligibility";

test("allows only compatible grammar and targeted math questions", () => {
  assert.equal(isQuestionBankEligibleShape({ drillSlug: "grammar", section: "rw", answerType: "mc_single" }), true);
  assert.equal(isQuestionBankEligibleShape({ drillSlug: "targeted-math", section: "math", answerType: "mc_single" }), true);
  assert.equal(isQuestionBankEligibleShape({ drillSlug: "targeted-math", section: "math", answerType: "grid_in" }), true);
});

const completeReadingQuestion = {
  drillSlug: "grammar",
  section: "rw",
  answerType: "mc_single",
  domain: "Standard English Conventions",
  skill: "Boundaries",
  difficulty: "medium",
  stem: "Which choice completes the text?",
  passage: "A complete passage.",
  content: {
    choices: [
      { id: "A", text: "one" },
      { id: "B", text: "two" },
      { id: "C", text: "three" },
      { id: "D", text: "four" },
    ],
    correct: "A",
  },
};

test("requires every runtime field before a catalog row is available", () => {
  assert.equal(isQuestionBankRuntimeReady(completeReadingQuestion), true);
  assert.match(
    questionBankPublishabilityIssue({ ...completeReadingQuestion, skill: null }) ?? "",
    /skill/i,
  );
  assert.match(
    questionBankPublishabilityIssue({ ...completeReadingQuestion, passage: " " }) ?? "",
    /passage/i,
  );
  assert.match(
    questionBankPublishabilityIssue({
      ...completeReadingQuestion,
      content: { ...completeReadingQuestion.content, correct: "" },
    }) ?? "",
    /correct/i,
  );
});

test("validates both Math answer formats", () => {
  const shared = {
    drillSlug: "targeted-math",
    section: "math",
    domain: "Algebra",
    skill: "Linear equations in one variable",
    difficulty: "hard",
    stem: "Solve for x.",
    passage: null,
  };
  assert.equal(isQuestionBankRuntimeReady({
    ...shared,
    answerType: "grid_in",
    content: { kind: "grid", accepted: ["2"] },
  }), true);
  assert.match(questionBankPublishabilityIssue({
    ...shared,
    answerType: "grid_in",
    content: { kind: "grid", accepted: [" "] },
  }) ?? "", /accepted/i);
  assert.equal(isQuestionBankRuntimeReady({
    ...shared,
    answerType: "mc_single",
    content: completeReadingQuestion.content,
  }), true);
});

test("rejects incompatible drill, section, and answer-type shapes", () => {
  assert.equal(isQuestionBankEligibleShape({ drillSlug: "reading", section: "rw", answerType: "mc_single" }), false);
  assert.equal(isQuestionBankEligibleShape({ drillSlug: "grammar", section: "math", answerType: "mc_single" }), false);
  assert.equal(isQuestionBankEligibleShape({ drillSlug: "grammar", section: "rw", answerType: "grid_in" }), false);
  assert.equal(isQuestionBankEligibleShape({ drillSlug: "ai-math", section: "math", answerType: "grid_in" }), false);
});
