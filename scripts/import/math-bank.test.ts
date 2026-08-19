import assert from "node:assert/strict";
import test from "node:test";
import { parseMathBankLines } from "./math-bank";

const SOURCE = [
  "Math Questions (775 Qs)",
  "Algebra (187 Qs)",
  "Linear functions (34 Qs)",
  "Medium",
  "Linear functions (medium) (4 Qs).docx",
].join("/");

test("parses standalone multiple-choice and student-produced response questions", () => {
  const result = parseMathBankLines([
    "(Math – Algebra – Linear functions – Medium)",
    "A taxi charges a fixed fee plus a rate per mile.",
    "Which equation represents the cost?",
    "A. y = 2x + 3",
    "B. y = 3x + 2",
    "C. y = 5x",
    "D. y = x + 5",
    "Correct Answer: B",
    "(Math – Algebra – Linear functions – Medium)",
    "What is the value of T(20)?",
    "Answer: 69",
  ], SOURCE);

  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0].type, "mc");
  assert.equal(result.questions[0].correct, "B");
  assert.equal(
    result.questions[0].prompt,
    "A taxi charges a fixed fee plus a rate per mile.\n\nWhich equation represents the cost?",
  );
  assert.equal(result.questions[0].passage, null);
  assert.equal(result.questions[1].type, "grid");
  assert.deepEqual(result.questions[1].acceptedAnswers, ["69"]);
});

test("infers an unlabeled numeric key without creating an answer-only question", () => {
  const result = parseMathBankLines([
    "(Math – Algebra – Linear functions – Medium)",
    "At what number of deliveries does the profit reach 0 dollars?",
    "7",
    "(Math – Algebra – Linear functions – Medium)",
    "What is the value of f(4)?",
    "12",
  ], SOURCE);

  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.questions[0].acceptedAnswers, ["7"]);
  assert.deepEqual(result.questions[1].acceptedAnswers, ["12"]);
  assert.match(result.questions[0].notes[0], /inferred/);

  const withOrphanAnswer = parseMathBankLines([
    "(Math – Algebra – Linear functions – Medium)",
    "What is f(1)?",
    "Answer: 4",
    "Correct Answer: D",
  ], SOURCE);
  assert.equal(withOrphanAnswer.questions.length, 1);
});

test("keeps corrected question headings and skips editorial dividers", () => {
  const result = parseMathBankLines([
    "Question 1",
    "(Math – Algebra – Linear functions – Medium)",
    "What is f(1)?",
    "Answer: 4",
    "––––––––––––",
    "Now, 7 additional original hard questions (non-table):",
    "Corrected Question 5 (locked):",
    "(Math – Algebra – Linear functions – Medium)",
    "What is f(2)?",
    "Answer 6",
  ], SOURCE);

  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[1].prompt, "What is f(2)?");
  assert.deepEqual(result.questions[1].acceptedAnswers, ["6"]);
});

test("converts literal HTML tables into runner-compatible markdown tables", () => {
  const result = parseMathBankLines([
    "(Math – Algebra – Linear functions – Medium)",
    "<p>The table shows two values.</p>",
    "<table>",
    "<tr><th>x</th><th>y</th></tr>",
    "<tr><td>1</td><td>3</td></tr>",
    "</table>",
    "What is the slope?",
    "Answer: 3",
  ], SOURCE);

  assert.match(result.questions[0].prompt, /\| x \| y \|@@ROW@@/);
  assert.doesNotMatch(result.questions[0].prompt, /<p>|<table>/);
});
