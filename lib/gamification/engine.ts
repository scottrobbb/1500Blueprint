// Pure gamification logic: level curve, XP rules, streaks, and the achievement
// catalog. No I/O — everything here is deterministic and unit-testable. The
// server layer (lib/gamification/state.ts) reads/writes the DB and calls these.

import type { AchievementCategory } from "@/lib/gamification";

export type Stats = {
  xp: number;
  level: number;
  streakCurrent: number;
  streakLongest: number;
  drillsCompleted: number;
  testsCompleted: number;
  dailyGoalsHit: number;
  bestTestScore: number;
  perfectDrills: number;
};

/* ------------------------------ Level curve ----------------------------- */

// XP required to advance FROM `level` to the next level. Grows linearly, so each
// level is a little harder than the last.
export function levelStep(level: number): number {
  return 100 + 25 * (level - 1);
}

// Cumulative XP total needed to be AT `level` (level 1 starts at 0 XP).
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += levelStep(l);
  return total;
}

export type LevelProgress = {
  level: number;
  floor: number; // total XP at the start of this level
  ceil: number; // total XP at the start of the next level
  toNext: number; // XP remaining to reach the next level
  pct: number; // 0..100 progress within the current level band
};

export function levelProgress(xp: number): LevelProgress {
  let level = 1;
  while (xp >= totalXpForLevel(level + 1)) level++;
  const floor = totalXpForLevel(level);
  const ceil = totalXpForLevel(level + 1);
  const span = ceil - floor;
  const pct = span > 0 ? Math.max(0, Math.min(100, Math.floor(((xp - floor) / span) * 100))) : 0;
  return { level, floor, ceil, toNext: Math.max(0, ceil - xp), pct };
}

/* -------------------------------- XP rules ------------------------------ */

export const DRILL_XP: Record<string, number> = {
  grammar: 50,
  reading: 40,
  "ai-math": 45,
  "targeted-math": 40,
  "word-scan": 35,
  vocab: 30,
  flashcards: 20,
};
export const DRILL_XP_DEFAULT = 30;

export function drillXp(slug: string): number {
  return DRILL_XP[slug] ?? DRILL_XP_DEFAULT;
}

// Share of base XP earned just for completing a drill; the rest scales with the
// 0..100 quality score (the AI grade for graded drills, accuracy for objective ones).
export const DRILL_FLOOR = 0.4;

// Grade-aware XP for one drill rep. A null score (no quality signal, e.g. a
// flashcard flip) earns the full base for completing.
export function drillXpFor(slug: string, score: number | null | undefined): number {
  const base = drillXp(slug);
  if (score == null) return base;
  const q = Math.max(0, Math.min(100, score)) / 100;
  return Math.round(base * (DRILL_FLOOR + (1 - DRILL_FLOOR) * q));
}

export const TEST_COMPLETE_XP = 200;

// Up to +300 scaled by the total SAT score (out of 1600).
export function testBonusXp(totalScore: number): number {
  const s = Math.max(0, Math.min(1600, totalScore));
  return Math.round((s / 1600) * 300);
}

/* --------------------------------- Dates -------------------------------- */

// All day math is UTC and keyed as YYYY-MM-DD.
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function shiftKey(key: string, deltaDays: number): string {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return dateKey(d);
}

// Monday-based weekday index: Mon=0 ... Sun=6.
export function mondayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

// UTC midnight of the Monday that starts d's week.
export function weekStart(d: Date): Date {
  const w = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  w.setUTCDate(w.getUTCDate() - mondayIndex(d));
  return w;
}

/* -------------------------------- Streaks ------------------------------- */

export type StreakResult = { streak: number; longest: number; isNewDay: boolean };

// Given activity on `today`, compute the new streak. Same-day activity doesn't
// change it; a consecutive day extends it; any gap resets it to 1.
export function advanceStreak(
  current: number,
  longest: number,
  lastActive: string | null,
  today: string,
): StreakResult {
  if (lastActive === today) return { streak: current, longest, isNewDay: false };
  const streak = lastActive === shiftKey(today, -1) ? current + 1 : 1;
  return { streak, longest: Math.max(longest, streak), isNewDay: true };
}

/* ------------------------------ Achievements ---------------------------- */

export type Achievement = {
  id: string;
  label: string;
  description: string;
  category: AchievementCategory;
  glyph: string; // SVG path, kept for reference; the hub draws its own family icons
  metric: keyof Stats;
  threshold: number;
  test: (s: Stats) => boolean;
};

export type AchievementRule = Pick<Achievement, "id" | "metric" | "threshold">;

const GLYPH = {
  star: "M0 -8 L2.4 -2.5 L8 -2 L3.6 2 L5 7.5 L0 4.3 L-5 7.5 L-3.6 2 L-8 -2 L-2.4 -2.5 Z",
  rocket: "M0 -8 C4 -4 4 2 0 7 C-4 2 -4 -4 0 -8 Z M0 1 a1.6 1.6 0 0 0 0 -3 a1.6 1.6 0 0 0 0 3",
  flame: "M0 -8 C4 -4 5 0 5 2 a5 5 0 0 1 -10 0 c0 -1.5 .6 -2.6 1.3 -3.4 .2 1 .9 1.6 1.7 1.8 C0 -4 1 -5.5 0 -8 Z",
  target: "M0 0 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M0 0 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
  cap: "M-8 -2 L0 -6 L8 -2 L0 2 Z M-5 0 V4 C-5 6 5 6 5 4 V0",
  hash: "M-7 -2 h14 M-7 2 h14 M0 -7 v14",
  diamond: "M0 -8 L7 0 L0 8 L-7 0 Z M-7 0 H7 M0 -8 V8",
};

function tier(
  prefix: string,
  category: AchievementCategory,
  glyph: string,
  key: keyof Stats,
  rows: { n: number; label: string; desc: string }[],
): Achievement[] {
  return rows.map((r) => ({
    id: `${prefix}-${r.n}`,
    label: r.label,
    description: r.desc,
    category,
    glyph,
    metric: key,
    threshold: r.n,
    test: (s: Stats) => s[key] >= r.n,
  }));
}

// 65 achievements across tiered families. Order = display order on the hub.
export const ACHIEVEMENTS: Achievement[] = [
  ...tier("xp", "xp", GLYPH.star, "xp", [
    { n: 100, label: "First Points", desc: "Earn your first 100 XP." },
    { n: 250, label: "Warming Up", desc: "Reach 250 total XP." },
    { n: 500, label: "Point Hunter", desc: "Reach 500 total XP." },
    { n: 1000, label: "Grand", desc: "Reach 1,000 total XP." },
    { n: 2500, label: "XP Machine", desc: "Reach 2,500 total XP." },
    { n: 5000, label: "Five Thousand", desc: "Reach 5,000 total XP." },
    { n: 10000, label: "Ten Thousand Club", desc: "Reach 10,000 total XP." },
    { n: 25000, label: "XP Legend", desc: "Reach 25,000 total XP." },
    { n: 50000, label: "XP Titan", desc: "Reach 50,000 total XP." },
    { n: 75000, label: "XP Overlord", desc: "Reach 75,000 total XP." },
    { n: 100000, label: "Six-Figure Scholar", desc: "Reach 100,000 total XP." },
    { n: 150000, label: "XP Ascendant", desc: "Reach 150,000 total XP." },
    { n: 250000, label: "XP Immortal", desc: "Reach 250,000 total XP." },
  ]),
  ...tier("level", "level", GLYPH.rocket, "level", [
    { n: 2, label: "Level Up", desc: "Reach level 2." },
    { n: 5, label: "Rising Star", desc: "Reach level 5." },
    { n: 10, label: "Double Digits", desc: "Reach level 10." },
    { n: 15, label: "Halfway Hero", desc: "Reach level 15." },
    { n: 20, label: "Twenty Strong", desc: "Reach level 20." },
    { n: 25, label: "Apex", desc: "Reach level 25." },
    { n: 30, label: "Ascended", desc: "Reach level 30." },
    { n: 40, label: "Vanguard", desc: "Reach level 40." },
    { n: 50, label: "Half Century", desc: "Reach level 50." },
    { n: 75, label: "Grandmaster", desc: "Reach level 75." },
    { n: 100, label: "Centennial", desc: "Reach level 100." },
  ]),
  ...tier("streak", "streak", GLYPH.flame, "streakLongest", [
    { n: 2, label: "Back Again", desc: "Build a 2-day streak." },
    { n: 3, label: "On Fire", desc: "Build a 3-day streak." },
    { n: 7, label: "Week Warrior", desc: "Build a 7-day streak." },
    { n: 14, label: "Fortnight", desc: "Build a 14-day streak." },
    { n: 30, label: "Monthly Master", desc: "Build a 30-day streak." },
    { n: 60, label: "Unbreakable", desc: "Build a 60-day streak." },
    { n: 100, label: "Centurion", desc: "Build a 100-day streak." },
    { n: 150, label: "Relentless", desc: "Build a 150-day streak." },
    { n: 200, label: "Iron Will", desc: "Build a 200-day streak." },
    { n: 300, label: "Blueprinted", desc: "Build a 300-day streak." },
  ]),
  ...tier("drills", "drills", GLYPH.hash, "drillsCompleted", [
    { n: 1, label: "First Drill", desc: "Complete your first drill." },
    { n: 10, label: "Getting Reps", desc: "Complete 10 drills." },
    { n: 25, label: "Quarter Century", desc: "Complete 25 drills." },
    { n: 50, label: "Half Hundred", desc: "Complete 50 drills." },
    { n: 100, label: "Century Club", desc: "Complete 100 drills." },
    { n: 250, label: "Drill Sergeant", desc: "Complete 250 drills." },
    { n: 500, label: "Five Hundred", desc: "Complete 500 drills." },
    { n: 750, label: "Seven-Fifty", desc: "Complete 750 drills." },
    { n: 1000, label: "1k", desc: "Complete 1,000 drills." },
    { n: 2500, label: "Drill Machine", desc: "Complete 2,500 drills." },
    { n: 5000, label: "Drill Legend", desc: "Complete 5,000 drills." },
  ]),
  ...tier("tests", "tests", GLYPH.cap, "testsCompleted", [
    { n: 1, label: "Test Drive", desc: "Finish a full practice test." },
    { n: 3, label: "Triple", desc: "Finish 3 practice tests." },
    { n: 5, label: "High Five", desc: "Finish 5 practice tests." },
    { n: 10, label: "Marathoner", desc: "Finish 10 practice tests." },
    { n: 15, label: "Test Titan", desc: "Finish 15 practice tests." },
    { n: 20, label: "Twenty Tests", desc: "Finish 20 practice tests." },
  ]),
  ...tier("goals", "goals", GLYPH.target, "dailyGoalsHit", [
    { n: 1, label: "Goal Getter", desc: "Hit your daily goal once." },
    { n: 7, label: "Goal Streak", desc: "Hit your daily goal 7 times." },
    { n: 30, label: "Goal Machine", desc: "Hit your daily goal 30 times." },
    { n: 60, label: "Goal Champion", desc: "Hit your daily goal 60 times." },
    { n: 90, label: "Goal Legend", desc: "Hit your daily goal 90 times." },
  ]),
  {
    id: "perfect-drill",
    label: "Sharpshooter",
    description: "Score 100 on a drill.",
    category: "milestone",
    glyph: GLYPH.target,
    metric: "perfectDrills",
    threshold: 1,
    test: (s) => s.perfectDrills >= 1,
  },
  {
    id: "perfect-10",
    label: "Marksman",
    description: "Score 100 on 10 drills.",
    category: "milestone",
    glyph: GLYPH.target,
    metric: "perfectDrills",
    threshold: 10,
    test: (s) => s.perfectDrills >= 10,
  },
  {
    id: "perfect-50",
    label: "Deadeye",
    description: "Score 100 on 50 drills.",
    category: "milestone",
    glyph: GLYPH.target,
    metric: "perfectDrills",
    threshold: 50,
    test: (s) => s.perfectDrills >= 50,
  },
  ...tier("score", "milestone", GLYPH.diamond, "bestTestScore", [
    { n: 1000, label: "Getting There", desc: "Score 1000+ on a practice test." },
    { n: 1200, label: "Solid Score", desc: "Score 1200+ on a practice test." },
    { n: 1300, label: "Great Score", desc: "Score 1300+ on a practice test." },
    { n: 1400, label: "1400 Club", desc: "Score 1400+ on a practice test." },
    { n: 1500, label: "1500 Club", desc: "Score 1500+ on a practice test." },
    { n: 1600, label: "Scott's Disciple", desc: "Score a 1600 on a practice test." },
  ]),
];

// Family metadata for the achievements UI (display order + labels). Icons and
// colors live in the component.
export const ACHIEVEMENT_CATEGORIES: { key: AchievementCategory; label: string }[] = [
  { key: "xp", label: "XP" },
  { key: "level", label: "Levels" },
  { key: "streak", label: "Streak" },
  { key: "drills", label: "Drills" },
  { key: "tests", label: "Tests" },
  { key: "goals", label: "Goals" },
  { key: "milestone", label: "Milestones" },
];

// IDs of every achievement satisfied by the given stats.
export function satisfiedAchievements(stats: Stats): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(stats)).map((a) => a.id);
}

// Serializable rules supplied to the atomic award RPC. Keeping the rule metadata
// beside each catalog item makes the database transaction follow the exact same
// thresholds as the UI without maintaining a second achievement catalog in SQL.
export function achievementRules(): AchievementRule[] {
  return ACHIEVEMENTS.map(({ id, metric, threshold }) => ({ id, metric, threshold }));
}
