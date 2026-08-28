import assert from "node:assert/strict";
import test from "node:test";
import { gradeCoursePractice, isCheckboxChoiceCorrect, isCoursePracticeAnswerCorrect, isCoursePracticeQuestionComplete, normalizeCoursePracticeAnswer, parseCheckboxAnswer, serializeCheckboxAnswer } from "./practice";
import type { CoursePractice } from "./types";

const practice: CoursePractice = {
  title: "Check",
  instructions: "",
  passingScore: 75,
  randomizeQuestions: false,
  questions: [
    { id: "mcq", type: "multiple_choice", prompt: "2 + 2?", choices: ["3", "4"], correctAnswer: "4", explanation: "Two pairs make four." },
    { id: "free", type: "free_response", prompt: "Half of 10?", choices: [], correctAnswer: "1/2", acceptedAnswers: ["0.5"], explanation: "10 / 2 = 5, and 5/10 reduces to 1/2." },
  ],
};

const checkboxQuestion = { id: "checkbox", type: "checkbox" as const, prompt: "Which are prime?", choices: ["2", "3", "4", "9"], correctAnswer: serializeCheckboxAnswer(["2", "3"]), explanation: "2 and 3 have no divisors other than 1 and themselves." };

test("course practice grading normalizes answers and calculates pass state", () => {
  const result = gradeCoursePractice(practice, [{ questionId: "mcq", answer: " 4 " }, { questionId: "free", answer: "6" }]);
  assert.equal(result.score, 50);
  assert.equal(result.correctCount, 1);
  assert.equal(result.passed, false);
  assert.deepEqual(result.results, { mcq: true, free: false });
});

test("course practice free-response grading accepts alternate answer forms", () => {
  assert.equal(isCoursePracticeAnswerCorrect(practice.questions[1], "1/2"), true);
  assert.equal(isCoursePracticeAnswerCorrect(practice.questions[1], "0.5"), true);
  assert.equal(isCoursePracticeAnswerCorrect(practice.questions[1], " 0.5 "), true);
  assert.equal(isCoursePracticeAnswerCorrect(practice.questions[1], "0.6"), false);
  const legacyQuestion = { ...practice.questions[0], acceptedAnswers: undefined };
  assert.equal(isCoursePracticeAnswerCorrect(legacyQuestion, "4"), true);
});

test("course practice completeness validates MCQ options and the correct answer", () => {
  assert.equal(isCoursePracticeQuestionComplete(practice.questions[0]), true);
  assert.equal(isCoursePracticeQuestionComplete({ ...practice.questions[0], correctAnswer: "missing" }), false);
  assert.equal(isCoursePracticeQuestionComplete({ ...practice.questions[1], explanation: "" }), true);
  assert.equal(isCoursePracticeQuestionComplete({ ...practice.questions[1], prompt: "" }), true);
  assert.equal(normalizeCoursePracticeAnswer("  A   B "), "a b");
});

test("checkbox answers serialize as an order-independent set", () => {
  assert.equal(serializeCheckboxAnswer(["2", "3", "2"]), "2\n3");
  assert.deepEqual(parseCheckboxAnswer(" 2 \n3\n"), ["2", "3"]);
  assert.deepEqual(parseCheckboxAnswer(""), []);
});

test("checkbox grading requires exactly the correct set, regardless of order or extras", () => {
  assert.equal(isCoursePracticeAnswerCorrect(checkboxQuestion, serializeCheckboxAnswer(["2", "3"])), true);
  assert.equal(isCoursePracticeAnswerCorrect(checkboxQuestion, serializeCheckboxAnswer(["3", "2"])), true);
  assert.equal(isCoursePracticeAnswerCorrect(checkboxQuestion, serializeCheckboxAnswer(["2"])), false);
  assert.equal(isCoursePracticeAnswerCorrect(checkboxQuestion, serializeCheckboxAnswer(["2", "3", "4"])), false);
  assert.equal(isCoursePracticeAnswerCorrect(checkboxQuestion, ""), false);
  assert.equal(isCheckboxChoiceCorrect(checkboxQuestion, "2"), true);
  assert.equal(isCheckboxChoiceCorrect(checkboxQuestion, "4"), false);
});

test("checkbox completeness requires at least two choices and at least one marked correct", () => {
  assert.equal(isCoursePracticeQuestionComplete(checkboxQuestion), true);
  assert.equal(isCoursePracticeQuestionComplete({ ...checkboxQuestion, correctAnswer: "" }), false);
  assert.equal(isCoursePracticeQuestionComplete({ ...checkboxQuestion, choices: ["2"] }), false);
  assert.equal(isCoursePracticeQuestionComplete({ ...checkboxQuestion, correctAnswer: serializeCheckboxAnswer(["2", "not a choice"]) }), false);
});
