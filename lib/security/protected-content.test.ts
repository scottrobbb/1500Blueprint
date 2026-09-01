import assert from "node:assert/strict";
import test from "node:test";
import {
  enforceProtectedContentRead,
  protectedContentPolicy,
} from "./protected-content";

test("only high-value content delivery pages receive account read limits", () => {
  assert.equal(protectedContentPolicy("/ultimate/bank/math/practice")?.surface, "question-bank-session");
  assert.equal(protectedContentPolicy("/ultimate/bank/reading-writing/practice")?.surface, "question-bank-session");
  assert.equal(protectedContentPolicy("/practice-test/test-1")?.surface, "practice-test");
  assert.equal(protectedContentPolicy("/practice-test/test-1/module/rw-1")?.surface, "practice-test");
  assert.equal(protectedContentPolicy("/drills/grammar")?.surface, "drill-session");
  assert.equal(protectedContentPolicy("/ultimate/courses/foundations/day-1")?.surface, "course-lesson");
  assert.equal(protectedContentPolicy("/ultimate/bank/math"), null);
  assert.equal(protectedContentPolicy("/ultimate/courses/foundations"), null);
  assert.equal(protectedContentPolicy("/practice-test/completed"), null);
  assert.equal(protectedContentPolicy("/practice-test/test-1/modules"), null);
  assert.equal(protectedContentPolicy("/practice-test/test-1/attempts"), null);
  assert.equal(protectedContentPolicy("/practice-test/test-1/results/attempt-1"), null);
  assert.equal(protectedContentPolicy("/practice-test/test-1/module/rw-1/results/attempt-1"), null);
  assert.equal(protectedContentPolicy("/api/tests/session"), null);
});

// A Max student hit the question bank's daily ceiling in ordinary use: it was
// set to 60, the lowest of any surface, while the window is fixed rather than
// sliding, so exhausting it cost most of a day. The bank is the surface a paid
// student navigates most, so its ceiling must not sit below the others'.
test("the question bank is not throttled harder than lower-frequency surfaces", () => {
  const dailyFor = (pathname: string) =>
    protectedContentPolicy(pathname)?.windows.find((window) => window.name === "daily")?.limit ?? 0;

  const questionBank = dailyFor("/ultimate/bank/math/practice");
  for (const pathname of ["/ultimate/courses/foundations/day-1", "/drills/grammar", "/practice-test/test-1"]) {
    assert.ok(
      questionBank >= dailyFor(pathname),
      `question bank daily limit ${questionBank} is below ${pathname}'s ${dailyFor(pathname)}`,
    );
  }
  // Well clear of what a human can reach by navigating, while still bounded.
  assert.ok(questionBank >= 300, `question bank daily limit ${questionBank} is too tight for normal paid use`);
});

test("practice test runners use a fresh quota scope", async () => {
  const scopes: string[] = [];
  await enforceProtectedContentRead("student@example.com", "/practice-test/test-1", {
    check: async (scope, _discriminator, options) => {
      scopes.push(scope);
      return { allowed: true, used: 1, limit: options.limit, resetsAt: "2026-08-30T12:00:00.000Z" };
    },
    report: () => undefined,
  });

  assert.deepEqual(scopes, [
    "protected-content:practice-test-runner-v2:burst",
    "protected-content:practice-test-runner-v2:daily",
  ]);
});

test("content limits are account-scoped, fail open on outages, and report only anonymous surfaces", async () => {
  const calls: { scope: string; discriminator: string; limit: number }[] = [];
  const reports: unknown[][] = [];
  const dependencies = {
    check: async (scope: string, discriminator: string, options: { limit: number; windowSeconds: number }) => {
      calls.push({ scope, discriminator, limit: options.limit });
      if (scope.endsWith(":daily")) return null;
      return { allowed: true, used: 1, limit: options.limit, resetsAt: "2026-08-28T12:00:00.000Z" };
    },
    report: (...args: unknown[]) => reports.push(args),
  };

  assert.deepEqual(
    await enforceProtectedContentRead("student@example.com", "/ultimate/bank/math/practice", dependencies),
    { allowed: true, degraded: true },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.discriminator === "student@example.com"), true);
  assert.deepEqual(reports, []);
});

test("exhausted content limits return the longest reset and emit no account identifier", async () => {
  const reports: unknown[][] = [];
  const result = await enforceProtectedContentRead(
    "private-student@example.com",
    "/ultimate/bank/reading-writing/practice",
    {
      check: async (scope, _discriminator, options) => ({
        allowed: false,
        used: options.limit + 1,
        limit: options.limit,
        resetsAt: scope.endsWith(":daily")
          ? "2026-08-29T12:00:00.000Z"
          : "2026-08-28T12:01:00.000Z",
      }),
      report: (...args: unknown[]) => reports.push(args),
    },
  );

  assert.deepEqual(result, {
    allowed: false,
    degraded: false,
    resetsAt: "2026-08-29T12:00:00.000Z",
  });
  assert.equal(JSON.stringify(reports).includes("private-student@example.com"), false);
  assert.equal(JSON.stringify(reports).includes("question-bank-session"), true);
});
