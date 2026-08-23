import assert from "node:assert/strict";
import test from "node:test";
import { buildStudentProgress, summarizeTestScores, withLessonProgress } from "./summary";

test("question totals remain source-specific and add only exact saved attempts", () => {
  const progress = buildStudentProgress({
    lessonsCompleted: 2,
    totalLessons: 8,
    questionBank: { attempted: 7, correct: 5 },
    coursePractice: { attempted: 3, correct: 2 },
    drills: {
      attempted: 2,
      correct: 1,
      sessions: 4,
      uniqueQuestions: 9,
      trackedAttempts: 14,
      recentSessions: [],
    },
    tests: { count: 0, latestScore: null, bestScore: null, improvement: null },
    recentActivity: [],
  });

  assert.deepEqual(
    progress.questions.sources.map((source) => [source.key, source.attempted, source.correct, source.incorrect, source.accuracy]),
    [
      ["question_bank", 7, 5, 2, 71],
      ["course_practice", 3, 2, 1, 67],
      ["drills", 2, 1, 1, 50],
    ],
  );
  assert.deepEqual(
    { attempted: progress.questions.attempted, correct: progress.questions.correct, incorrect: progress.questions.incorrect, accuracy: progress.questions.accuracy },
    { attempted: 12, correct: 8, incorrect: 4, accuracy: 67 },
  );
  assert.equal(progress.drills.trackedAttempts, 14, "legacy mastery attempts stay separately labeled and are not double-counted");
});

test("test improvement compares the first score with the latest, not the personal best", () => {
  const result = summarizeTestScores([
    { testSlug: "test-2", totalScore: 1310, createdAt: "2026-08-03T12:00:00Z" },
    { testSlug: "test-1", totalScore: 1200, createdAt: "2026-08-01T12:00:00Z" },
    { testSlug: "test-1", totalScore: 1380, createdAt: "2026-08-02T12:00:00Z" },
  ]);

  assert.equal(result.latestScore, 1310);
  assert.equal(result.bestScore, 1380);
  assert.equal(result.improvement, 110);
  assert.equal(result.testsDone, 3);
  assert.deepEqual(result.countBySlug, { "test-1": 2, "test-2": 1 });
});

test("a single scored test has no improvement comparison", () => {
  const result = summarizeTestScores([{ testSlug: "test-1", totalScore: 1200, createdAt: "2026-08-01T12:00:00Z" }]);
  assert.equal(result.improvement, null);
});

test("accessible course totals can replace the all-course fallback without changing other progress", () => {
  const base = buildStudentProgress({
    lessonsCompleted: 7,
    totalLessons: 20,
    questionBank: { attempted: 1, correct: 1 },
    coursePractice: { attempted: 0, correct: 0 },
    drills: { attempted: 0, correct: 0, sessions: 0, uniqueQuestions: 0, trackedAttempts: 0, recentSessions: [] },
    tests: { count: 0, latestScore: null, bestScore: null, improvement: null },
    recentActivity: [],
  });
  const scoped = withLessonProgress(base, { completed: 2, total: 5 });
  assert.deepEqual(scoped.lessons, { completed: 2, total: 5 });
  assert.equal(scoped.questions.attempted, 1);
});
