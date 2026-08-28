import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAnswerMap, sanitizePerQuestionTime, sanitizeRouted } from "./submission";

const allowed = new Set(["q1", "q2"]);

test("test submission sanitizers keep only bounded known question data", () => {
  assert.deepEqual(sanitizeAnswerMap({ q1: "A", q2: "3/4" }, allowed), { q1: "A", q2: "3/4" });
  assert.equal(sanitizeAnswerMap({ unknown: "A" }, allowed), null);
  assert.equal(sanitizeAnswerMap({ q1: "x".repeat(501) }, allowed), null);
  assert.deepEqual(sanitizePerQuestionTime({ q1: 12.6, q2: 999_999 }, allowed), { q1: 13, q2: 86_400 });
  assert.equal(sanitizePerQuestionTime({ unknown: 1 }, allowed), null);
});

test("sanitizeRouted accepts only SAT section variants", () => {
  assert.deepEqual(sanitizeRouted({ rw: "easy", math: "hard" }), { rw: "easy", math: "hard" });
  assert.equal(sanitizeRouted({ rw: "draft" }), null);
  assert.equal(sanitizeRouted({ science: "easy" }), null);
});
