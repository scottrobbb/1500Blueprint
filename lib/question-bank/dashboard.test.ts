import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyQuestionBankDashboard,
  normalizeQuestionBankDashboard,
} from "./dashboard";

test("empty dashboard includes both subjects, all difficulties, and twelve weeks", () => {
  const dashboard = emptyQuestionBankDashboard(new Date("2026-08-18T12:00:00Z"));

  assert.deepEqual(dashboard.subjects.map((subject) => subject.section), ["rw", "math"]);
  assert.equal(dashboard.difficulty.length, 6);
  assert.equal(dashboard.activity.length, 12);
  assert.equal(dashboard.activity.at(-1)?.weekStart, "2026-08-17");
});

test("dashboard normalization accepts Postgres numeric strings and fills missing rows", () => {
  const dashboard = normalizeQuestionBankDashboard({
    summary: { attempted: "12", correct: "9", accuracy: "75", saved: "2", streak: "4" },
    subjects: [
      { section: "math", available: "83", solved: "10", attempts: "12", correct: "9", accuracy: "75" },
    ],
    activity: [{ weekStart: "2026-08-17", correct: "9", wrong: "3" }],
    topics: [{ section: "math", domain: "Algebra", available: "20", attempts: "4", correct: "3", accuracy: "75" }],
    difficulty: [{ section: "math", difficulty: "easy", available: "10", attempts: "4", correct: "3", accuracy: "75", averageDurationMs: "45000" }],
  });

  assert.equal(dashboard.summary.accuracy, 75);
  assert.equal(dashboard.subjects[0].section, "rw");
  assert.equal(dashboard.subjects[0].available, 0);
  assert.equal(dashboard.subjects[1].available, 83);
  assert.equal(dashboard.activity[0].wrong, 3);
  assert.equal(dashboard.difficulty.find((metric) => metric.section === "math" && metric.difficulty === "easy")?.averageDurationMs, 45000);
});
