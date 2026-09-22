import assert from "node:assert/strict";
import test from "node:test";
import { parseTest5Lines } from "./parse-test5";

test("mixed Test 5 headings preserve R&W explanations, remove editorial labels, and identify Math variants", () => {
  const modules = parseTest5Lines([
    "Reading/Writing (PV)", "Module 1, Baseline", "1) COMMAND, TEXTUAL NEW",
    "A student claims that the narrator enjoys the garden.",
    "Which quotation best supports the claim? MEDIUM HUMANITIES",
    "A) The garden was beautiful. X", "B) He left.", "C) It rained.", "D) She slept.",
    "EXPLANATION", "Choice A is the best answer because it describes the garden positively.",
    "Choice B is incorrect because it does not describe the garden.",
    "<u>https://example.com/source</u>; <u>https://example.com/notes</u>",
    "Math Mod 1 (from TPB 5)", "Question 1 (math – algebra – linear equations in one variable – easy)",
    "What is x if x + 1 = 3?", "Answer: 2",
    "Math Mod 2 Easy", "Question 1 (math – algebra – linear equations in one var – easy)",
    "What is x if x + 1 = 4?", "Answer:", "3",
    "Math Mod 2 Hard", "Question 1 (math – advanced math – nonlinear equations in one variable – hard)",
    "What is the positive root of x² = 16?", "Answer: 4",
  ]);
  const reading = modules[0].questions[0];
  assert.equal(reading.correct, "A");
  assert.equal(reading.difficulty, "medium");
  assert.equal(reading.skill, "Command of Evidence");
  assert.equal(reading.explanationSource, "human");
  assert.doesNotMatch(reading.passage!, /COMMAND|NEW/);
  assert.doesNotMatch(reading.prompt, /MEDIUM|HUMANITIES/);
  assert.doesNotMatch(reading.explanation!, /https:/);
  assert.equal(reading.choices[0].text, "The garden was beautiful.");
  assert.deepEqual(modules.slice(1).map((module) => module.variant), [null, "easy", "hard"]);
  assert.deepEqual(modules[2].questions[0].acceptedAnswers, ["3"]);
  assert.doesNotMatch(modules[2].questions[0].prompt, /Answer/);
});

test("Math imports reject missing branch labels and out-of-order question numbers", () => {
  assert.throws(() => parseTest5Lines(["Math Mod 2"]), /requires an Easy or Hard/);
  assert.throws(() => parseTest5Lines([
    "Math Mod 1", "Question 2 (math – algebra – linear functions – easy)", "What is x?", "Answer: 1",
  ]), /numbering mismatch/);
});
