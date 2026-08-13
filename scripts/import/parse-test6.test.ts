import assert from "node:assert/strict";
import test from "node:test";
import { parseTest6Lines } from "./parse-test6";

test("parses Test 6 choices, supplied explanations, tables, and figures", () => {
  const modules = parseTest6Lines([
    "Reading/Writing",
    "Baseline",
    "1)",
    "| Year | Value |@@ROW@@|---|---|@@ROW@@| 2025 | 10 |",
    "Which choice best uses the table? MEDIUM, SCIENCE",
    "[[IMG:image1.png]]",
    "A) First",
    "B) Second",
    "C) Third",
    "D) Fourth",
    "EXPLANATION",
    "Choice C is the best answer because it agrees with the table.",
    "Choice A is incorrect because it does not.",
    "Choice B is incorrect because it does not.",
    "Choice D is incorrect because it does not.",
  ]);

  const question = modules[0].questions[0];
  assert.equal(question.type, "mc");
  assert.equal(question.correct, "C");
  assert.equal(question.difficulty, "medium");
  assert.equal(question.prompt, "Which choice best uses the table?");
  assert.match(question.passage ?? "", /@@ROW@@/);
  assert.equal(question.figure, "image1.png");
  assert.equal(question.explanationSource, "human");
  assert.match(question.choices[2].explanation ?? "", /^Choice C is the best answer/);
});

test("uses and removes trailing X choice markers in the Test 2 format", () => {
  const modules = parseTest6Lines([
    "Reading/Writing",
    "Module 1, Baseline",
    "1) WORD IN CONTEXT",
    "A short passage.",
    "Which choice completes the text? MEDIUM",
    "A) speculative X",
    "B) nonexistent",
    "C) repudiated",
    "D) preliminary",
    "EXPLANATION",
    "The marked choice best completes the text.",
    "2) RHETORICAL SYNTHESIS",
    "Another short passage.",
    "Which choice is most logical? SOCIAL STUDIES, HARD",
    "A) First",
    "B) Second",
    "C) Third",
    "D) Fourth",
    "EXPLANATION",
    "Choice C is the best answer because it is logical.",
    "3) TRANSITIONS",
    "A final short passage.",
    "Which choice is most logical? DIFFICULTY, TOPIC",
    "A) However,",
    "B) Likewise,",
    "C) For example,",
    "D) Therefore, X",
    "EXPLANATION",
    "Choice D is the best answer because it shows the result.",
  ]);

  assert.equal(modules.length, 1);
  assert.equal(modules[0].order, 1);
  const [marked, reversedMetadata, placeholderMetadata] = modules[0].questions;
  assert.equal(marked.correct, "A");
  assert.equal(marked.choices[0].text, "speculative");
  assert.equal(marked.difficulty, "medium");
  assert.equal(marked.needsReview, false);
  assert.ok(marked.choices.every((choice) => !/\sX$/.test(choice.text)));
  assert.equal(reversedMetadata.correct, "C");
  assert.equal(reversedMetadata.difficulty, "hard");
  assert.equal(placeholderMetadata.correct, "D");
  assert.equal(placeholderMetadata.prompt, "Which choice is most logical?");
  assert.equal(placeholderMetadata.difficulty, null);
  assert.deepEqual(placeholderMetadata.notes, ["missing difficulty"]);
});

test("handles the source's one missing EXPLANATION heading", () => {
  const modules = parseTest6Lines([
    "Math",
    "Hard",
    "1)",
    "Which equation is correct?",
    "A) x = 1",
    "B) x = 2",
    "C) x = 3",
    "D) x = 4",
    "Choice B is the best answer because x equals 2.",
    "Choice A is incorrect.",
    "Choice C is incorrect.",
    "Choice D is incorrect.",
    "Topic: Algebra",
    "Difficulty: Hard",
  ]);

  const question = modules[0].questions[0];
  assert.equal(question.correct, "B");
  assert.equal(question.choices[3].text, "x = 4");
  assert.match(question.explanation ?? "", /^Choice B is the best answer/);
});

test("preserves an explicit grid-in answer without inventing an explanation", () => {
  const modules = parseTest6Lines([
    "Math",
    "Hard",
    "1)",
    "What is the value of k?",
    "Answer: -7",
    "Topic: Advanced Math",
    "Difficulty: Hard",
  ]);

  const question = modules[0].questions[0];
  assert.equal(question.type, "grid");
  assert.deepEqual(question.acceptedAnswers, ["-7"]);
  assert.equal(question.explanation, null);
  assert.deepEqual(question.notes, ["missing supplied explanation"]);
});

test("parses Test 7 module headings and question content sharing the number line", () => {
  const modules = parseTest6Lines([
    "Math",
    "Module 1",
    "1) [[IMG:image1.png]] Which value is correct?",
    "A) 1",
    "B) 2",
    "C) 3",
    "D) 4",
    "EXPLANATION",
    "Choice B is the best answer because it is 2.",
    "Choice A is incorrect.",
    "Choice C is incorrect.",
    "Choice D is incorrect.",
    "Advanced Math\tNonlinear functions\tMedium",
    "Module 2 Easy",
    "1)",
    "What is x?",
    "Answer: 5",
    "Difficulty: Easy",
    "Module 2 Hard",
    "1)",
    "What is y?",
    "Answer: 7",
    "Difficulty: Hard",
  ]);

  assert.deepEqual(
    modules.map((module) => [module.order, module.variant, module.questions.length]),
    [[1, null, 1], [2, "easy", 1], [2, "hard", 1]],
  );
  assert.equal(modules[0].questions[0].prompt, "Which value is correct?");
  assert.equal(modules[0].questions[0].figure, "image1.png");
  assert.equal(modules[0].questions[0].domain, "Advanced Math");
  assert.equal(modules[0].questions[0].skill, "Nonlinear functions");
  assert.equal(modules[0].questions[0].difficulty, "medium");
  assert.doesNotMatch(modules[0].questions[0].explanation ?? "", /Advanced Math/);
});

test("parses Test 7 dotted choices and standalone grid-in answer markers", () => {
  const modules = parseTest6Lines([
    "Math",
    "Module 1",
    "1)",
    "Which choice is correct?",
    "A. One",
    "B. Two",
    "C. Three",
    "D. Four",
    "ANSWER: B",
    "EXPLANATION",
    "Choice B is the best answer because it is two.",
    "Advanced Math Nonlinear functions Medium",
    "2)",
    "What is the area?",
    "ANSWER",
    "892",
    "EXPLANATION",
    "The answer is 892.",
    "Geometry & Trigonometry Area and Volume Medium",
  ]);

  const [multipleChoice, gridIn] = modules[0].questions;
  assert.equal(multipleChoice.type, "mc");
  assert.equal(multipleChoice.correct, "B");
  assert.equal(multipleChoice.choices[3].text, "Four");
  assert.equal(gridIn.type, "grid");
  assert.equal(gridIn.prompt, "What is the area?");
  assert.deepEqual(gridIn.acceptedAnswers, ["892"]);
});

test("does not mistake an instruction beginning with Answer for an answer marker", () => {
  const modules = parseTest6Lines([
    "Math",
    "Module 1",
    "1)",
    "Answer the question using the information given.",
    "What is x?",
    "Answer: 5",
    "Difficulty: Easy",
  ]);

  const question = modules[0].questions[0];
  assert.equal(question.passage, "Answer the question using the information given.");
  assert.equal(question.prompt, "What is x?");
  assert.deepEqual(question.acceptedAnswers, ["5"]);
});

test("parses an R&W-only source with alternate module headings", () => {
  const modules = parseTest6Lines(
    [
      "Baseline Module",
      "1)",
      "Which choice is correct? EASY, HUMANITIES",
      "A) One",
      "B) Two",
      "C) Three",
      "D) Four",
      "EXPLANATION",
      "Choice B is the best answer because it is two.",
      "Module 2, Easy",
      "1)",
      "Which choice is correct? MEDIUM, SCIENCE",
      "A) One",
      "B) Two",
      "C) Three",
      "D) Four",
      "EXPLANATION",
      "Choice C is the best answer because it is three.",
      "Hard Module",
      "1)",
      "Which choice is correct? HARD, LITERATURE",
      "A) One",
      "B) Two",
      "C) Three",
      "D) Four",
      "EXPLANATION",
      "Choice D is the best answer because it is four.",
    ],
    { initialSection: "rw" },
  );

  assert.deepEqual(
    modules.map((module) => [module.section, module.order, module.variant, module.questions[0].correct]),
    [
      ["rw", 1, null, "B"],
      ["rw", 2, "easy", "C"],
      ["rw", 2, "hard", "D"],
    ],
  );
});
