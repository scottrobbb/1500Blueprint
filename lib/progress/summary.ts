import type {
  DrillSessionHistory,
  ProgressActivityItem,
  QuestionProgressSource,
  QuestionProgressSourceKey,
  StudentProgress,
} from "./types";

export type TestScoreRow = {
  testSlug: string;
  totalScore: number | null;
  createdAt: string;
};

export type TestScoreSummary = {
  latestScore: number | null;
  bestScore: number | null;
  testsDone: number;
  improvement: number | null;
  bestBySlug: Record<string, number>;
  countBySlug: Record<string, number>;
};

export function summarizeTestScores(rows: TestScoreRow[]): TestScoreSummary {
  const chronological = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => Date.parse(a.row.createdAt) - Date.parse(b.row.createdAt) || a.index - b.index)
    .map(({ row }) => row);
  const scored = chronological.filter(
    (row): row is TestScoreRow & { totalScore: number } => typeof row.totalScore === "number",
  );
  const firstScore = scored[0]?.totalScore ?? null;
  const latestScore = scored.at(-1)?.totalScore ?? null;
  const bestBySlug: Record<string, number> = {};
  const countBySlug: Record<string, number> = {};

  for (const row of chronological) {
    countBySlug[row.testSlug] = (countBySlug[row.testSlug] ?? 0) + 1;
    if (typeof row.totalScore === "number") {
      bestBySlug[row.testSlug] = Math.max(bestBySlug[row.testSlug] ?? 0, row.totalScore);
    }
  }

  return {
    latestScore,
    bestScore: scored.length > 0 ? Math.max(...scored.map((row) => row.totalScore)) : null,
    testsDone: chronological.length,
    improvement: scored.length > 1 && latestScore != null && firstScore != null ? latestScore - firstScore : null,
    bestBySlug,
    countBySlug,
  };
}

function questionSource(
  key: QuestionProgressSourceKey,
  label: string,
  definition: string,
  attempted: number,
  correct: number,
): QuestionProgressSource {
  const safeAttempted = Math.max(0, Math.round(attempted));
  const safeCorrect = Math.min(safeAttempted, Math.max(0, Math.round(correct)));
  const incorrect = safeAttempted - safeCorrect;
  return {
    key,
    label,
    definition,
    attempted: safeAttempted,
    correct: safeCorrect,
    incorrect,
    accuracy: safeAttempted > 0 ? Math.round((safeCorrect / safeAttempted) * 100) : null,
  };
}

export type StudentProgressInput = {
  lessonsCompleted: number;
  totalLessons: number;
  questionBank: { attempted: number; correct: number };
  coursePractice: { attempted: number; correct: number };
  drills: {
    attempted: number;
    correct: number;
    sessions: number;
    uniqueQuestions: number;
    trackedAttempts: number;
    recentSessions: DrillSessionHistory[];
  };
  tests: {
    count: number;
    latestScore: number | null;
    bestScore: number | null;
    improvement: number | null;
  };
  recentActivity: ProgressActivityItem[];
};

export function buildStudentProgress(input: StudentProgressInput): StudentProgress {
  const sources = [
    questionSource(
      "question_bank",
      "Question Bank",
      "All saved Question Bank answer attempts, including questions later removed from the active catalog.",
      input.questionBank.attempted,
      input.questionBank.correct,
    ),
    questionSource(
      "course_practice",
      "Course practice",
      "Every question in each completed lesson practice attempt.",
      input.coursePractice.attempted,
      input.coursePractice.correct,
    ),
    questionSource(
      "drills",
      "Drill answers",
      "Objective answers use exact correctness; AI evaluations count as correct when they meet that drill's passing score.",
      input.drills.attempted,
      input.drills.correct,
    ),
  ];
  const attempted = sources.reduce((sum, source) => sum + source.attempted, 0);
  const correct = sources.reduce((sum, source) => sum + source.correct, 0);

  return {
    lessons: {
      completed: Math.max(0, Math.round(input.lessonsCompleted)),
      total: Math.max(0, Math.round(input.totalLessons)),
    },
    questions: {
      attempted,
      correct,
      incorrect: attempted - correct,
      accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : null,
      sources,
    },
    drills: {
      sessions: Math.max(0, Math.round(input.drills.sessions)),
      uniqueQuestions: Math.max(0, Math.round(input.drills.uniqueQuestions)),
      trackedAttempts: Math.max(0, Math.round(input.drills.trackedAttempts)),
      recentSessions: input.drills.recentSessions,
    },
    tests: input.tests,
    recentActivity: [...input.recentActivity]
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, 16),
  };
}

export function withLessonProgress(
  progress: StudentProgress,
  lessons: { completed: number; total: number },
): StudentProgress {
  return {
    ...progress,
    lessons: {
      completed: Math.max(0, Math.round(lessons.completed)),
      total: Math.max(0, Math.round(lessons.total)),
    },
  };
}
