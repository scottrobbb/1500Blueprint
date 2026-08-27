// Gamification UI contracts (the shapes the hub + nav render). Live values
// come from lib/gamification/state.ts (DB-backed).

export type Player = {
  name: string;
  firstName: string;
  initials: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  xpForNextLevel: number;
  streak: number;
  plan: string; // membership tier label, e.g. "1500 Club"
  rank: number; // weekly leaderboard rank
  season: string;
  rivalName: string; // person just ahead on the board
  xpBehindRival: number;
};

// Compact stats for the top nav (shown on every authed surface).
export type NavStats = {
  streak: number;
  level: number;
  xp: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
  plan: string;
  isAdmin: boolean;
  isExplanationEditor: boolean;
};

// One day in the weekly streak row. `done` = the daily goal was met that day
// (what keeps the flame); `xp` = XP earned that day (for display).
export type StreakDay = { label: string; xp: number; done: boolean };

export type LeaderRow = {
  rank: number;
  name: string;
  xp: string;
  initials: string;
  avatarUrl: string | null;
  you: boolean;
};

export type AchievementCategory =
  | "xp"
  | "level"
  | "streak"
  | "drills"
  | "tests"
  | "goals"
  | "milestone";

// One achievement, with its current unlock state for this student.
export type AchievementItem = {
  id: string;
  label: string;
  description: string;
  category: AchievementCategory;
  unlocked: boolean;
};

// Per-family roll-up shown as a medallion on the hub card.
export type AchievementCategorySummary = {
  key: AchievementCategory;
  label: string;
  unlocked: number;
  total: number;
};

export type AchievementsView = {
  unlocked: number;
  total: number;
  categories: AchievementCategorySummary[];
  items: AchievementItem[];
  nextUp: AchievementItem | null; // closest locked achievement to chase
};
