import assert from "node:assert/strict";
import test from "node:test";
import { pinnedQuestionBankSession, questionBankSession, resumedQuestionBankSession } from "./math";

type Row = { id: string; figureUrl: string | null };
const corpus: Row[] = Array.from({ length: 40 }, (_, index) => ({
  id: `q${index + 1}`,
  figureUrl: null,
}));

// The report: a student answered 12 of a planner task's 15 questions, pressed
// Continue the next day, and the task started over. Nothing had been lost --
// the runner re-ran the "unattempted first" selection, so the 12 he had
// finished fell out of the session and 12 new ones took their place.
test("a planner task hands back the questions it handed out", () => {
  const first = questionBankSession(corpus, "unanswered", { attemptedIds: new Set(), incorrectIds: new Set<string>() }, 15);
  const answered = new Set(first.slice(0, 12).map((row) => row.id));

  const reopened = pinnedQuestionBankSession(corpus, first.map((row) => row.id));

  assert.deepEqual(reopened.map((row) => row.id), first.map((row) => row.id));
  assert.equal(reopened.filter((row) => answered.has(row.id)).length, 12);
});

test("without the pin the same reopen replaces every answered question", () => {
  const first = questionBankSession(corpus, "unanswered", { attemptedIds: new Set(), incorrectIds: new Set<string>() }, 15);
  const answered = new Set(first.slice(0, 12).map((row) => row.id));

  const reopened = questionBankSession(corpus, "unanswered", { attemptedIds: answered, incorrectIds: new Set<string>() }, 15);

  assert.equal(reopened.filter((row) => answered.has(row.id)).length, 0);
});

test("a retired question leaves the pinned set rather than pulling in a new one", () => {
  const pinnedIds = corpus.slice(0, 15).map((row) => row.id);
  const remaining = corpus.filter((row) => row.id !== "q4");

  const session = pinnedQuestionBankSession(remaining, pinnedIds);

  assert.equal(session.length, 14);
  assert.ok(!session.some((row) => row.id === "q4"));
});

// The first open of a task worked before it had a pinned set: the questions
// already answered for it have to be in the session, or pinning would freeze
// the student's finished work out of their own task.
test("the first open carries the work already done into the set", () => {
  const carried = corpus.slice(0, 12);
  const answered = new Set(carried.map((row) => row.id));

  const session = resumedQuestionBankSession(carried, corpus, "unanswered", { attemptedIds: answered, incorrectIds: new Set<string>() }, 15);

  assert.equal(session.length, 15);
  assert.deepEqual(session.slice(0, 12).map((row) => row.id), carried.map((row) => row.id));
  assert.equal(session.filter((row) => answered.has(row.id)).length, 12);
  assert.equal(new Set(session.map((row) => row.id)).size, 15);
});

test("carried work never overruns the size the task asked for", () => {
  const carried = corpus.slice(0, 20);
  const answered = new Set(carried.map((row) => row.id));

  const session = resumedQuestionBankSession(carried, corpus, "unanswered", { attemptedIds: answered, incorrectIds: new Set<string>() }, 15);

  assert.equal(session.length, 15);
  assert.ok(session.every((row) => answered.has(row.id)));
});

test("with nothing carried it is an ordinary session", () => {
  assert.deepEqual(
    resumedQuestionBankSession([], corpus, "unanswered", { attemptedIds: new Set(["q1"]), incorrectIds: new Set<string>() }, 15),
    questionBankSession(corpus, "unanswered", { attemptedIds: new Set(["q1"]), incorrectIds: new Set<string>() }, 15),
  );
});
