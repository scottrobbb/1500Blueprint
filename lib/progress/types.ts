export type QuestionProgressSourceKey = "question_bank" | "course_practice" | "drills";

export type QuestionProgressSource = {
  key: QuestionProgressSourceKey;
  label: string;
  definition: string;
  attempted: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
};

export type ProgressActivityKind = "question_bank" | "course_practice" | "drill" | "practice_test" | "lesson";

export type ProgressActivityItem = {
  id: string;
  kind: ProgressActivityKind;
  title: string;
  detail: string;
  occurredAt: string;
  href: string;
  outcome?: "positive" | "negative" | "neutral";
};

export type DrillSessionHistory = {
  id: string;
  drillSlug: string;
  title: string;
  score: number | null;
  correct: number | null;
  total: number | null;
  createdAt: string;
};

export type StudentProgress = {
  lessons: {
    completed: number;
    total: number;
  };
  questions: {
    attempted: number;
    correct: number;
    incorrect: number;
    accuracy: number | null;
    sources: QuestionProgressSource[];
  };
  drills: {
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
