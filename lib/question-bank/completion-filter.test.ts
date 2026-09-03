import assert from "node:assert/strict";
import test from "node:test";
import { questionBankSession, questionsMatchingCompletion } from "./math";

type Row = { id: string; figureUrl: string | null };
const corpus: Row[] = Array.from({ length: 12 }, (_, index) => ({
  id: `q${index + 1}`,
  figureUrl: null,
}));
// q1-q8 attempted, q9-q12 not.
const attempted = new Set(corpus.slice(0, 8).map((row) => row.id));

// The report: a student filtered to unattempted and still got attempted
// questions. The session used to top itself back up to its full size by
// relaxing the completion filter, so any pool smaller than a session leaked
// attempted questions into both the runner and the panel.
test("an unattempted session is never padded with attempted questions", () => {
  const session = questionBankSession(corpus, "unanswered", attempted, 10);
  assert.equal(session.length, 4, "a filtered session is allowed to be short");
  assert.deepEqual(session.map((row) => row.id).sort(), ["q10", "q11", "q12", "q9"]);
  assert.ok(session.every((row) => !attempted.has(row.id)));
});

test("the same holds for the attempted filter", () => {
  const session = questionBankSession(corpus, "attempted", attempted, 20);
  assert.equal(session.length, 8);
  assert.ok(session.every((row) => attempted.has(row.id)));
});

test("a filtered session still fills up when the pool is large enough", () => {
  const session = questionBankSession(corpus, "unanswered", new Set(["q1"]), 5);
  assert.equal(session.length, 5);
  assert.ok(!session.some((row) => row.id === "q1"));
});

test("no filter still uses the whole pool, capped at the session size", () => {
  assert.equal(questionBankSession(corpus, "all", attempted, 5).length, 5);
  assert.equal(questionBankSession(corpus, "all", attempted, 50).length, 12);
});

test("the completion match itself keeps the two sides exclusive", () => {
  const unseen = questionsMatchingCompletion(corpus, "unanswered", attempted);
  const seen = questionsMatchingCompletion(corpus, "attempted", attempted);
  assert.equal(unseen.length + seen.length, corpus.length);
  assert.equal(unseen.filter((row) => seen.includes(row)).length, 0);
  assert.equal(questionsMatchingCompletion(corpus, "all", attempted).length, corpus.length);
});
