import {
  READING_MAX_LEVEL,
  READING_PASS_SCORE,
  READING_STREAK_TARGET,
  readingLevel,
  type ReadingDifficulty,
} from "./readingLevels";

export { READING_MAX_LEVEL, READING_PASS_SCORE, READING_STREAK_TARGET };

// A student's chosen step down one level, replayed in order with the scores.
export const READING_LEVEL_DOWN = "level-down" as const;
export type ReadingLedgerEntry = number | null | typeof READING_LEVEL_DOWN;

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
// advancing. A level-down marker drops one level (never below 1) and resets
// the streak, so later scores are judged at the lower level.
export function calculateReadingProgress(entries: ReadingLedgerEntry[]): ReadingProgressState {
  let level = 1;
  let streak = 0;

  for (const score of entries) {
    if (score === READING_LEVEL_DOWN) {
      level = Math.max(1, level - 1);
      streak = 0;
      continue;
    }
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
