import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_SAVED_IDS,
  parseSavedFilter,
  questionBankSession,
  questionsMatchingSaved,
} from "./math";

type Row = { id: string; figureUrl: string | null };
const corpus: Row[] = Array.from({ length: 12 }, (_, index) => ({
  id: `q${index + 1}`,
  figureUrl: null,
}));
// The student has marked four questions for review. Two of them (q2, q5) they
// have already attempted, which is the case that matters: marked and attempted
// are independent, so one must never imply the other.
const saved = new Set(["q2", "q5", "q9", "q11"]);
const attempted = new Set(corpus.slice(0, 8).map((row) => row.id));
const activity = { attemptedIds: attempted, incorrectIds: new Set(["q2"]) };

test("the filter is off unless the parameter is explicitly set", () => {
  assert.equal(parseSavedFilter("1"), true);
  assert.equal(parseSavedFilter(undefined), false);
  assert.equal(parseSavedFilter(""), false);
  assert.equal(parseSavedFilter("0"), false);
  assert.equal(parseSavedFilter("true"), false);
});

test("an unfiltered pool is returned whole, without touching the saved set", () => {
  assert.deepEqual(
    questionsMatchingSaved(corpus, false, EMPTY_SAVED_IDS).map((row) => row.id),
    corpus.map((row) => row.id),
  );
});

test("filtering to marked keeps only the questions the student marked", () => {
  assert.deepEqual(
    questionsMatchingSaved(corpus, true, saved).map((row) => row.id),
    ["q2", "q5", "q9", "q11"],
  );
});

test("a student with nothing marked gets an empty pool, not the whole bank", () => {
  assert.deepEqual(questionsMatchingSaved(corpus, true, new Set()), []);
});

// A save that outlives its question -- retired from the bank, or outside a free
// plan's pool -- must not conjure a row back into the session.
test("a saved id with no matching question contributes nothing", () => {
  assert.deepEqual(
    questionsMatchingSaved(corpus, true, new Set(["q3", "retired-question"])).map((row) => row.id),
    ["q3"],
  );
});

// The whole point of keeping this dimension separate: marked composes with
// completion rather than replacing it.
test("marked and completion filters compose", () => {
  const marked = questionsMatchingSaved(corpus, true, saved);

  const unattemptedAndMarked = questionBankSession(marked, "unanswered", activity, 50);
  assert.deepEqual(unattemptedAndMarked.map((row) => row.id), ["q9", "q11"]);

  const attemptedAndMarked = questionBankSession(marked, "attempted", activity, 50);
  assert.deepEqual(attemptedAndMarked.map((row) => row.id), ["q2", "q5"]);

  const incorrectAndMarked = questionBankSession(marked, "incorrect", activity, 50);
  assert.deepEqual(incorrectAndMarked.map((row) => row.id), ["q2"]);
});

test("a marked session still honours the session ceiling", () => {
  const everythingMarked = new Set(corpus.map((row) => row.id));
  const session = questionBankSession(
    questionsMatchingSaved(corpus, true, everythingMarked),
    "all",
    activity,
    5,
  );
  assert.equal(session.length, 5);
});
