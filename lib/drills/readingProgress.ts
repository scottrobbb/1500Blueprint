import {
  READING_MAX_LEVEL,
  READING_PASS_SCORE,
  READING_STREAK_TARGET,
  readingLevel,
  type ReadingDifficulty,
} from "./readingLevels";

export { READING_MAX_LEVEL, READING_PASS_SCORE, READING_STREAK_TARGET };

export type ReadingProgressState = {
  level: number;
  streak: number;
  streakTarget: number;
  // The level's live settings, so the player and the passage generator agree.
  passScore: number;
  readSeconds: number;
  difficulty: ReadingDifficulty;
  isMaxLevel: boolean;
};

// Replays a student's reading scores oldest-first to rebuild their level and
// current streak. Each score is judged against the pass mark of the level they
// were on at the time, so the ladder is reconstructed exactly from the ledger.
// Level 8 is the ceiling: a streak there stays pinned at the target instead of
// advancing.
export function calculateReadingProgress(scores: Array<number | null>): ReadingProgressState {
  let level = 1;
  let streak = 0;

  for (const score of scores) {
    if ((score ?? 0) < readingLevel(level).passScore) {
      streak = 0;
      continue;
    }

    streak += 1;
    if (streak >= READING_STREAK_TARGET) {
      if (level < READING_MAX_LEVEL) {
        level += 1;
        streak = 0;
      } else {
        streak = READING_STREAK_TARGET;
      }
    }
  }

  return readingProgressAt(level, streak);
}

// Builds the state object for a level/streak pair, folding in that level's
// timer, difficulty, and pass mark.
export function readingProgressAt(level: number, streak: number): ReadingProgressState {
  const current = readingLevel(level);
  return {
    level: current.level,
    streak,
    streakTarget: READING_STREAK_TARGET,
    passScore: current.passScore,
    readSeconds: current.readSeconds,
    difficulty: current.difficulty,
    isMaxLevel: current.level >= READING_MAX_LEVEL,
  };
}
