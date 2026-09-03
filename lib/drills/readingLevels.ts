// The Reading Comprehension Drill's 8-level ladder. Each level fixes three
// things: how long the passage stays on screen, how hard the generated passage
// is, and the recall score that counts as a pass. Levels 1-7 pass at 85; level
// 8 (the max) demands a near-perfect 95. Three passes in a row advance a level.

export const READING_MAX_LEVEL = 8;
export const READING_STREAK_TARGET = 3;
// Base pass mark, used for levels 1-7 and as the analytics "correct" cutoff.
export const READING_PASS_SCORE = 85;

export type ReadingDifficulty = "medium" | "hard" | "extreme";

export type ReadingLevel = {
  level: number;
  readSeconds: number;
  difficulty: ReadingDifficulty;
  passScore: number;
};

export const READING_LEVELS: readonly ReadingLevel[] = [
  { level: 1, readSeconds: 120, difficulty: "medium", passScore: READING_PASS_SCORE },
  { level: 2, readSeconds: 120, difficulty: "hard", passScore: READING_PASS_SCORE },
  { level: 3, readSeconds: 120, difficulty: "extreme", passScore: READING_PASS_SCORE },
  { level: 4, readSeconds: 105, difficulty: "extreme", passScore: READING_PASS_SCORE },
  { level: 5, readSeconds: 90, difficulty: "extreme", passScore: READING_PASS_SCORE },
  { level: 6, readSeconds: 75, difficulty: "extreme", passScore: READING_PASS_SCORE },
  { level: 7, readSeconds: 75, difficulty: "extreme", passScore: READING_PASS_SCORE },
  { level: 8, readSeconds: 75, difficulty: "extreme", passScore: 95 },
];

export const READING_DIFFICULTY_LABEL: Record<ReadingDifficulty, string> = {
  medium: "Medium",
  hard: "Hard",
  extreme: "Extremely hard",
};

// Clamps to the ladder so a level from an older or corrupt ledger still resolves.
export function readingLevel(level: number): ReadingLevel {
  const index = Math.min(READING_MAX_LEVEL, Math.max(1, Math.round(level))) - 1;
  return READING_LEVELS[index];
}
