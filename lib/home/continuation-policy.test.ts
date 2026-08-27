import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDrillHref,
  chooseHomeContinuation,
  describeTestPosition,
  isMissingRecentActivityTableError,
  parseStudyActivityInput,
  readResumableTestPosition,
  type HomeContinuation,
} from "./continuation-policy";

test("activity input accepts only known resources and keeps only allowlisted metadata", () => {
  assert.deepEqual(
    parseStudyActivityInput({
      kind: "drill",
      resourceId: " targeted-math ",
      metadata: { difficulty: "hard", href: "https://attacker.example" },
      title: "Untrusted title",
    }),
    {
      kind: "drill",
      resourceId: "targeted-math",
      metadata: { difficulty: "hard" },
    },
  );
  assert.deepEqual(
    parseStudyActivityInput({
      kind: "drill",
      resourceId: "word-scan",
      metadata: { mode: "anything-else" },
    }),
    {
      kind: "drill",
      resourceId: "word-scan",
      metadata: { mode: "ceased" },
    },
  );
  assert.deepEqual(
    parseStudyActivityInput({
      kind: "flashcard_set",
      resourceId: "a3e65ed8-b28c-4a24-888d-faa598379afb",
      metadata: { href: "/admin" },
    }),
    {
      kind: "flashcard_set",
      resourceId: "a3e65ed8-b28c-4a24-888d-faa598379afb",
      metadata: {},
    },
  );

  assert.equal(parseStudyActivityInput({ kind: "drill", resourceId: "unknown" }), null);
  assert.equal(parseStudyActivityInput({ kind: "flashcard_set", resourceId: "../../admin" }), null);
  assert.equal(parseStudyActivityInput({ kind: "practice_test", resourceId: "test-1" }), null);
});

test("drill destinations are rebuilt from safe route parameters", () => {
  assert.equal(
    buildDrillHref("targeted-math", { difficulty: "hard" }),
    "/drills/targeted-math?difficulty=hard",
  );
  assert.equal(
    buildDrillHref("targeted-math", { mode: "bad-mold" }),
    "/drills/targeted-math?difficulty=medium",
  );
  assert.equal(
    buildDrillHref("word-scan", { mode: "bad-mold" }),
    "/drills/word-scan?mode=bad-mold",
  );
  assert.equal(buildDrillHref("grammar", {}), "/drills/grammar");
});

test("only active, structurally valid test sessions are resumable", () => {
  const position = readResumableTestPosition({
    state: {
      phase: "module",
      sectionIndex: 0,
      moduleOrder: 1,
      qIndex: 3,
      timeLeft: 1_040,
    },
  });
  assert.deepEqual(position, {
    phase: "module",
    sectionIndex: 0,
    moduleOrder: 1,
    questionIndex: 3,
    timeLeft: 1_040,
    breakTarget: undefined,
    moduleVariant: undefined,
  });
  assert.equal(position && describeTestPosition(position), "Reading and Writing, Module 1, Question 4");

  const breakPosition = readResumableTestPosition({
    state: {
      phase: "break",
      sectionIndex: 0,
      moduleOrder: 2,
      qIndex: 0,
      timeLeft: 300,
      breakTarget: "nextSection",
    },
  });
  assert.equal(breakPosition && describeTestPosition(breakPosition), "Continue your break before Math");

  assert.equal(readResumableTestPosition({ state: { phase: "intro" } }), null);
  assert.equal(readResumableTestPosition({ state: { phase: "results" } }), null);
  assert.equal(readResumableTestPosition({
    state: { phase: "module", sectionIndex: 4, moduleOrder: 1, qIndex: 0, timeLeft: 10 },
  }), null);
  assert.equal(readResumableTestPosition({
    state: { phase: "module", sectionIndex: 0, moduleOrder: 1, qIndex: -1, timeLeft: 10 },
  }), null);
});

test("continuation precedence is exact test, recent activity, then historical drill", () => {
  const exactTest: HomeContinuation = {
    kind: "practice_test",
    resumeMode: "exact",
    title: "Practice Test 2",
    detail: "Math, Module 1, Question 8",
    href: "/practice-test/practice-test-2",
    updatedAt: "2026-08-27T12:00:00.000Z",
  };
  const recentDrill: HomeContinuation = {
    kind: "drill",
    resumeMode: "reopen",
    title: "Grammar Drill",
    detail: "Return to this practice activity",
    href: "/drills/grammar",
    updatedAt: "2026-08-27T13:00:00.000Z",
  };
  const historicalDrill = { ...recentDrill, updatedAt: "2026-08-26T13:00:00.000Z" };

  assert.equal(chooseHomeContinuation(exactTest, [recentDrill], historicalDrill), exactTest);
  assert.equal(chooseHomeContinuation(null, [recentDrill], historicalDrill), recentDrill);
  assert.equal(chooseHomeContinuation(null, [], historicalDrill), historicalDrill);
  assert.equal(chooseHomeContinuation(null, [], null), null);
});

test("missing recent-activity migrations degrade to historical continuation", () => {
  assert.equal(
    isMissingRecentActivityTableError({
      code: "PGRST205",
      message: "Could not find the table 'public.student_recent_activity' in the schema cache",
    }),
    true,
  );
  assert.equal(isMissingRecentActivityTableError({ code: "PGRST205", message: "another table" }), false);
  assert.equal(isMissingRecentActivityTableError({ code: "42501", message: "student_recent_activity" }), false);
});
