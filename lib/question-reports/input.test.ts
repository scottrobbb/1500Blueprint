import assert from "node:assert/strict";
import test from "node:test";
import { parseQuestionReportInput } from "./input";

test("question reports accept a supported target and trim the comment", () => {
  assert.deepEqual(
    parseQuestionReportInput({
      questionId: " question-123 ",
      targetType: "question-bank",
      reportType: "wrong-answer",
      comment: "  The marked answer conflicts with the explanation.  ",
    }),
    {
      ok: true,
      value: {
        questionId: "question-123",
        targetType: "question-bank",
        reportType: "wrong-answer",
        comment: "The marked answer conflicts with the explanation.",
      },
    },
  );
});

test("question reports reject unsupported targets, types, and empty details", () => {
  assert.equal(
    parseQuestionReportInput({
      questionId: "question-123",
      targetType: "course",
      reportType: "wrong-answer",
      comment: "Details",
    }).ok,
    false,
  );
  assert.equal(
    parseQuestionReportInput({
      questionId: "question-123",
      targetType: "practice-test",
      reportType: "spam",
      comment: "Details",
    }).ok,
    false,
  );
  assert.equal(
    parseQuestionReportInput({
      questionId: "question-123",
      targetType: "practice-test",
      reportType: "formatting",
      comment: "  ",
    }).ok,
    false,
  );
});

test("question reports enforce bounded identifiers and comments", () => {
  assert.equal(
    parseQuestionReportInput({
      questionId: "x".repeat(161),
      targetType: "question-bank",
      reportType: "other",
      comment: "Enough detail",
    }).ok,
    false,
  );
  assert.equal(
    parseQuestionReportInput({
      questionId: "question-123",
      targetType: "question-bank",
      reportType: "other",
      comment: "x".repeat(2_001),
    }).ok,
    false,
  );
});
