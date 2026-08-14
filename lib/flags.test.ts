import assert from "node:assert/strict";
import test from "node:test";
import {
  isDrillUnderConstruction,
  isPracticeTestUnderConstruction,
} from "./flags";

test("publishes Grammar, Reading, Vocab, and Flashcards while locking unfinished drills", () => {
  for (const slug of ["grammar", "reading", "vocab", "flashcards"]) {
    assert.equal(isDrillUnderConstruction(slug), false, slug);
  }

  for (const slug of ["targeted-math", "word-scan", "ai-math"]) {
    assert.equal(isDrillUnderConstruction(slug), true, slug);
  }
});

test("does not turn unknown routes into construction redirects", () => {
  assert.equal(isDrillUnderConstruction("not-a-drill"), false);
});

test("makes Practice Tests 1, 2, 6, and 7 public while keeping Tests 3-5 locked", () => {
  for (let number = 3; number <= 5; number++) {
    assert.equal(isPracticeTestUnderConstruction(`practice-test-${number}`), true);
  }
  assert.equal(isPracticeTestUnderConstruction("practice-test-1"), false);
  assert.equal(isPracticeTestUnderConstruction("practice-test-2"), false);
  assert.equal(isPracticeTestUnderConstruction("practice-test-6"), false);
  assert.equal(isPracticeTestUnderConstruction("practice-test-7"), false);
  assert.equal(isPracticeTestUnderConstruction("completed"), false);
});
