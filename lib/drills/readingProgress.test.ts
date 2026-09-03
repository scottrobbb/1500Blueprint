import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadingProgress } from "./readingProgress";
import { READING_MAX_LEVEL, READING_STREAK_TARGET, readingLevel } from "./readingLevels";

const pass = (level: number) => readingLevel(level).passScore;

test("a score below the level's pass mark resets the streak", () => {
  const progress = calculateReadingProgress([pass(1), pass(1) - 1]);

  assert.equal(progress.level, 1);
  assert.equal(progress.streak, 0);
});

test("a score at the pass mark increments the streak", () => {
  const progress = calculateReadingProgress([pass(1)]);

  assert.equal(progress.level, 1);
  assert.equal(progress.streak, 1);
});

test("three passes in a row advance one level and reset the streak", () => {
  const progress = calculateReadingProgress([85, 92, 100]);

  assert.equal(progress.level, 2);
  assert.equal(progress.streak, 0);
});

test("a failing score breaks a run of passing scores", () => {
  const progress = calculateReadingProgress([85, 90, 84, 88]);

  assert.equal(progress.level, 1);
  assert.equal(progress.streak, 1);
});

test("each group of three passes advances another level", () => {
  const progress = calculateReadingProgress([85, 86, 87, 88, 89, 90]);

  assert.equal(progress.level, 3);
  assert.equal(progress.streak, 0);
});

test("the level carries its own timer, difficulty and pass mark", () => {
  const level1 = calculateReadingProgress([]);
  assert.deepEqual(
    { readSeconds: level1.readSeconds, difficulty: level1.difficulty, passScore: level1.passScore },
    { readSeconds: 120, difficulty: "medium", passScore: 85 },
  );

  const level4 = calculateReadingProgress(Array(9).fill(100));
  assert.equal(level4.level, 4);
  assert.deepEqual(
    { readSeconds: level4.readSeconds, difficulty: level4.difficulty, passScore: level4.passScore },
    { readSeconds: 105, difficulty: "extreme", passScore: 85 },
  );
});

test("level 8 demands 95 and is scored against its own pass mark", () => {
  const reachLevel8 = Array(21).fill(100);
  const atEight = calculateReadingProgress(reachLevel8);
  assert.equal(atEight.level, READING_MAX_LEVEL);
  assert.equal(atEight.passScore, 95);
  assert.equal(atEight.isMaxLevel, true);

  // 90 clears every earlier level but not this one.
  const missed = calculateReadingProgress([...reachLevel8, 90]);
  assert.equal(missed.streak, 0);

  const cleared = calculateReadingProgress([...reachLevel8, 95]);
  assert.equal(cleared.streak, 1);
});

test("level 8 is the ceiling: a streak there stops at the target", () => {
  const progress = calculateReadingProgress(Array(30).fill(100));

  assert.equal(progress.level, READING_MAX_LEVEL);
  assert.equal(progress.streak, READING_STREAK_TARGET);
});
