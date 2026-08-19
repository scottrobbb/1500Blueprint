import assert from "node:assert/strict";
import test from "node:test";
import { gradeCoursePractice, isCoursePracticeQuestionComplete, normalizeCoursePracticeAnswer } from "./practice";
import type { CoursePractice } from "./types";

const practice: CoursePractice = {
  title: "Check",
  instructions: "",
  passingScore: 75,
  randomizeQuestions: false,
  questions: [
    { id: "mcq", type: "multiple_choice", prompt: "2 + 2?", choices: ["3", "4"], correctAnswer: "4", explanation: "Two pairs make four." },
    { id: "free", type: "free_response", prompt: "Half of 10?", choices: [], correctAnswer: "5", explanation: "10 / 2 = 5." },
  ],
};

test("course practice grading normalizes answers and calculates pass state", () => {
  const result = gradeCoursePractice(practice, [{ questionId: "mcq", answer: " 4 " }, { questionId: "free", answer: "6" }]);
  assert.equal(result.score, 50);
  assert.equal(result.correctCount, 1);
  assert.equal(result.passed, false);
  assert.deepEqual(result.results, { mcq: true, free: false });
});

test("course practice completeness validates MCQ options and explanations", () => {
  assert.equal(isCoursePracticeQuestionComplete(practice.questions[0]), true);
  assert.equal(isCoursePracticeQuestionComplete({ ...practice.questions[0], correctAnswer: "missing" }), false);
  assert.equal(isCoursePracticeQuestionComplete({ ...practice.questions[1], explanation: "" }), false);
  assert.equal(normalizeCoursePracticeAnswer("  A   B "), "a b");
});
