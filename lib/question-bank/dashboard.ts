export type QuestionBankSection = "rw" | "math";
// Attempts record the question's stored difficulty, so this has to admit
// "challenge" or a student's Challenge attempts vanish from the breakdown.
export type QuestionBankDifficulty = "easy" | "medium" | "hard" | "challenge";

export type QuestionBankSummary = {
  attempted: number;
  correct: number;
  accuracy: number;
  saved: number;
  streak: number;
};

export type QuestionBankSubject = {
  section: QuestionBankSection;
  available: number;
  solved: number;
  attempts: number;
  correct: number;
  accuracy: number;
};

export type QuestionBankActivity = {
  weekStart: string;
  correct: number;
  wrong: number;
  easyCorrect: number;
  mediumCorrect: number;
  hardCorrect: number;
  easyWrong: number;
  mediumWrong: number;
  hardWrong: number;
};

export type QuestionBankTopic = {
  section: QuestionBankSection;
  domain: string;
  available: number;
  attempts: number;
  correct: number;
  accuracy: number;
};

export type QuestionBankDifficultyMetric = {
  section: QuestionBankSection;
  difficulty: QuestionBankDifficulty;
  available: number;
  attempts: number;
  correct: number;
  accuracy: number;
  averageDurationMs: number;
};

export type QuestionBankDashboard = {
  summary: QuestionBankSummary;
  subjects: QuestionBankSubject[];
  activity: QuestionBankActivity[];
  topics: QuestionBankTopic[];
  difficulty: QuestionBankDifficultyMetric[];
};

type UnknownRecord = Record<string, unknown>;

const SECTIONS: QuestionBankSection[] = ["rw", "math"];
const DIFFICULTIES: QuestionBankDifficulty[] = ["easy", "medium", "hard", "challenge"];

export function emptyQuestionBankDashboard(now = new Date()): QuestionBankDashboard {
  return {
    summary: { attempted: 0, correct: 0, accuracy: 0, saved: 0, streak: 0 },
    subjects: SECTIONS.map((section) => ({
      section,
      available: 0,
      solved: 0,
      attempts: 0,
      correct: 0,
      accuracy: 0,
    })),
    activity: lastTwelveWeeks(now).map((weekStart) => ({
      weekStart,
      correct: 0,
      wrong: 0,
      easyCorrect: 0,
      mediumCorrect: 0,
      hardCorrect: 0,
      easyWrong: 0,
      mediumWrong: 0,
      hardWrong: 0,
    })),
    topics: [],
    difficulty: SECTIONS.flatMap((section) =>
      DIFFICULTIES.map((difficulty) => ({
        section,
        difficulty,
        available: 0,
        attempts: 0,
        correct: 0,
        accuracy: 0,
        averageDurationMs: 0,
      })),
    ),
  };
}

export function normalizeQuestionBankDashboard(value: unknown): QuestionBankDashboard {
  const fallback = emptyQuestionBankDashboard();
  if (!isRecord(value)) return fallback;

  const summary = isRecord(value.summary) ? value.summary : {};
  const subjects = readRecords(value.subjects)
    .map(normalizeSubject)
    .filter((item): item is QuestionBankSubject => item !== null);
  const activity = readRecords(value.activity)
    .map(normalizeActivity)
    .filter((item): item is QuestionBankActivity => item !== null);
  const topics = readRecords(value.topics)
    .map(normalizeTopic)
    .filter((item): item is QuestionBankTopic => item !== null);
  const difficulty = readRecords(value.difficulty)
    .map(normalizeDifficulty)
    .filter((item): item is QuestionBankDifficultyMetric => item !== null);

  return {
    summary: {
      attempted: numberValue(summary.attempted),
      correct: numberValue(summary.correct),
      accuracy: percentage(summary.accuracy),
      saved: numberValue(summary.saved),
      streak: numberValue(summary.streak),
    },
    subjects: SECTIONS.map(
      (section) => subjects.find((subject) => subject.section === section)
        ?? fallback.subjects.find((subject) => subject.section === section)!,
    ),
    activity: activity.length > 0 ? activity : fallback.activity,
    topics,
    difficulty: SECTIONS.flatMap((section) =>
      DIFFICULTIES.map(
        (level) => difficulty.find((metric) => metric.section === section && metric.difficulty === level)
          ?? fallback.difficulty.find((metric) => metric.section === section && metric.difficulty === level)!,
      ),
    ),
  };
}

function normalizeSubject(row: UnknownRecord): QuestionBankSubject | null {
  const section = sectionValue(row.section);
  if (!section) return null;
  return {
    section,
    available: numberValue(row.available),
    solved: numberValue(row.solved),
    attempts: numberValue(row.attempts),
    correct: numberValue(row.correct),
    accuracy: percentage(row.accuracy),
  };
}

function normalizeActivity(row: UnknownRecord): QuestionBankActivity | null {
  if (typeof row.weekStart !== "string") return null;
  return {
    weekStart: row.weekStart,
    correct: numberValue(row.correct),
    wrong: numberValue(row.wrong),
    easyCorrect: numberValue(row.easyCorrect),
    mediumCorrect: numberValue(row.mediumCorrect),
    hardCorrect: numberValue(row.hardCorrect),
    easyWrong: numberValue(row.easyWrong),
    mediumWrong: numberValue(row.mediumWrong),
    hardWrong: numberValue(row.hardWrong),
  };
}

function normalizeTopic(row: UnknownRecord): QuestionBankTopic | null {
  const section = sectionValue(row.section);
  if (!section || typeof row.domain !== "string") return null;
  return {
    section,
    domain: row.domain,
    available: numberValue(row.available),
    attempts: numberValue(row.attempts),
    correct: numberValue(row.correct),
    accuracy: percentage(row.accuracy),
  };
}

function normalizeDifficulty(row: UnknownRecord): QuestionBankDifficultyMetric | null {
  const section = sectionValue(row.section);
  const difficulty = difficultyValue(row.difficulty);
  if (!section || !difficulty) return null;
  return {
    section,
    difficulty,
    available: numberValue(row.available),
    attempts: numberValue(row.attempts),
    correct: numberValue(row.correct),
    accuracy: percentage(row.accuracy),
    averageDurationMs: numberValue(row.averageDurationMs),
  };
}

function readRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sectionValue(value: unknown): QuestionBankSection | null {
  return value === "rw" || value === "math" ? value : null;
}

function difficultyValue(value: unknown): QuestionBankDifficulty | null {
  return value === "easy" || value === "medium" || value === "hard" ? value : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function percentage(value: unknown): number {
  return Math.min(100, numberValue(value));
}

function lastTwelveWeeks(now: Date): string[] {
  const currentMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (currentMonday.getUTCDay() + 6) % 7;
  currentMonday.setUTCDate(currentMonday.getUTCDate() - daysSinceMonday);

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(currentMonday);
    date.setUTCDate(date.getUTCDate() - (11 - index) * 7);
    return date.toISOString().slice(0, 10);
  });
}
