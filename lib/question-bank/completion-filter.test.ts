import assert from "node:assert/strict";
import test from "node:test";
import { incorrectQuestionIds, questionBankSession, questionsMatchingCompletion } from "./math";

type Row = { id: string; figureUrl: string | null };
const corpus: Row[] = Array.from({ length: 12 }, (_, index) => ({
  id: `q${index + 1}`,
  figureUrl: null,
}));
// q1-q8 attempted, q9-q12 not. Of the attempted, q1-q3 have never been
// answered correctly and q4-q8 have.
const attempted = new Set(corpus.slice(0, 8).map((row) => row.id));
const incorrect = new Set(["q1", "q2", "q3"]);
const activity = { attemptedIds: attempted, incorrectIds: incorrect };

// The report: a student filtered to unattempted and still got attempted
// questions. The session used to top itself back up to its full size by
// relaxing the completion filter, so any pool smaller than a session leaked
// attempted questions into both the runner and the panel.
test("an unattempted session is never padded with attempted questions", () => {
  const session = questionBankSession(corpus, "unanswered", activity, 10);
  assert.equal(session.length, 4, "a filtered session is allowed to be short");
  assert.deepEqual(session.map((row) => row.id).sort(), ["q10", "q11", "q12", "q9"]);
  assert.ok(session.every((row) => !attempted.has(row.id)));
});

test("the same holds for the attempted filter", () => {
  const session = questionBankSession(corpus, "attempted", activity, 20);
  assert.equal(session.length, 8);
  assert.ok(session.every((row) => attempted.has(row.id)));
});

test("a filtered session still fills up when the pool is large enough", () => {
  const session = questionBankSession(corpus, "unanswered", { attemptedIds: new Set(["q1"]), incorrectIds: new Set<string>() }, 5);
  assert.equal(session.length, 5);
  assert.ok(!session.some((row) => row.id === "q1"));
});

test("no filter still uses the whole pool, capped at the session size", () => {
  assert.equal(questionBankSession(corpus, "all", activity, 5).length, 5);
  assert.equal(questionBankSession(corpus, "all", activity, 50).length, 12);
});

test("the completion match itself keeps the two sides exclusive", () => {
  const unseen = questionsMatchingCompletion(corpus, "unanswered", activity);
  const seen = questionsMatchingCompletion(corpus, "attempted", activity);
  assert.equal(unseen.length + seen.length, corpus.length);
  assert.equal(unseen.filter((row) => seen.includes(row)).length, 0);
  assert.equal(questionsMatchingCompletion(corpus, "all", activity).length, corpus.length);
});

/* ------------------------------ Incorrect ------------------------------ */

test("the incorrect filter returns only questions never answered correctly", () => {
  const session = questionBankSession(corpus, "incorrect", activity, 20);

  assert.deepEqual(session.map((row) => row.id), ["q1", "q2", "q3"]);
});

// Incorrect is a subset of attempted, not a fourth exclusive bucket: a question
// the student got wrong is still one they have seen.
test("incorrect sits inside attempted rather than beside it", () => {
  const seen = questionsMatchingCompletion(corpus, "attempted", activity);
  const wrong = questionsMatchingCompletion(corpus, "incorrect", activity);

  assert.ok(wrong.every((row) => seen.includes(row)));
  assert.equal(questionsMatchingCompletion(corpus, "unanswered", activity).some((row) => incorrect.has(row.id)), false);
});

test("an incorrect session is short rather than padded with questions the student got right", () => {
  const session = questionBankSession(corpus, "incorrect", activity, 10);

  assert.equal(session.length, 3);
  assert.ok(session.every((row) => incorrect.has(row.id)));
});

test("with nothing outstanding the incorrect filter returns nothing", () => {
  const session = questionBankSession(
    corpus,
    "incorrect",
    { attemptedIds: attempted, incorrectIds: new Set<string>() },
    10,
  );

  assert.deepEqual(session, []);
});

// A question is "incorrect" only while it has never been answered correctly, so
// getting it right once takes it off the review queue for good.
test("incorrect ids are derived from the attempt tallies", () => {
  const ids = incorrectQuestionIds(new Map([
    ["missed", { attempts: 1, correct: 0 }],
    ["missed-repeatedly", { attempts: 4, correct: 0 }],
    ["fixed", { attempts: 3, correct: 1 }],
    ["first-time", { attempts: 1, correct: 1 }],
    ["untouched", { attempts: 0, correct: 0 }],
  ]));

  assert.deepEqual([...ids].sort(), ["missed", "missed-repeatedly"]);
});
