import assert from "node:assert/strict";
import test from "node:test";
import {
  enforceProtectedContentRead,
  protectedContentPolicy,
} from "./protected-content";

test("only high-value content delivery pages receive account read limits", () => {
  assert.equal(protectedContentPolicy("/ultimate/bank/math/practice")?.surface, "question-bank-session");
  assert.equal(protectedContentPolicy("/ultimate/bank/reading-writing/practice")?.surface, "question-bank-session");
  assert.equal(protectedContentPolicy("/practice-test/test-1/module/rw-1")?.surface, "practice-test");
  assert.equal(protectedContentPolicy("/drills/grammar")?.surface, "drill-session");
  assert.equal(protectedContentPolicy("/ultimate/courses/foundations/day-1")?.surface, "course-lesson");
  assert.equal(protectedContentPolicy("/ultimate/bank/math"), null);
  assert.equal(protectedContentPolicy("/ultimate/courses/foundations"), null);
  assert.equal(protectedContentPolicy("/practice-test/completed"), null);
  assert.equal(protectedContentPolicy("/api/tests/session"), null);
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
