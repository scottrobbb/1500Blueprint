import assert from "node:assert/strict";
import test from "node:test";
import { parseReadingBankLines } from "./reading-writing-bank";

const SOURCE = "Reading Questions (481 Qs)/Craft and Structure (196Qs)/Words in Context (80Qs)/Easy/WIC - Easy (1Qs).docx";

test("parses an English question with passage, prompt, choices, key, and explanation", () => {
  const result = parseReadingBankLines([
    "Question 1",
    "The narrator placed the bag beside the bench.",
    "As used in the text, what does the word set most nearly mean?",
    "A. Established",
    "B. Adjusted",
    "C. Put down",
    "D. Hardened",
    "Answer: C",
    "Explanation: The narrator physically placed the bag beside the bench.",
  ], SOURCE);

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].domain, "Craft and Structure");
  assert.equal(result.questions[0].skill, "Words in Context");
  assert.equal(result.questions[0].difficulty, "easy");
  assert.equal(result.questions[0].passage, "The narrator placed the bag beside the bench.");
  assert.match(result.questions[0].prompt, /what does the word set/i);
  assert.equal(result.questions[0].correct, "C");
  assert.match(result.questions[0].explanation, /physically placed/);
  assert.deepEqual(result.warnings, []);
});

test("maps Challenge sources to hard and keeps multiline explanations", () => {
  const source = "Reading Questions (481 Qs)/Expression of Ideas (80Qs)/Transitions (45Qs)/Challenge/Transitions - Challenge (1Qs).docx";
  const result = parseReadingBankLines([
    "Question 7",
    "The first claim is true. ______, the second claim is also true.",
    "Which choice completes the text with the most logical transition?",
    "A. However",
    "B. Likewise",
    "C. Instead",
    "D. Nevertheless",
    "Correct Answer: B",
    "Rationale: The claims support one another.",
    "Likewise signals that relationship.",
  ], source);

  assert.equal(result.questions[0].difficulty, "hard");
  assert.equal(result.questions[0].rawNumber, 7);
  assert.equal(result.questions[0].explanation, "The claims support one another.\n\nLikewise signals that relationship.");
});
