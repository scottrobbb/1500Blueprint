import type { StudentRow } from "./state";

export type GrowthWeekBucket = {
  weekStart: string;
  free: number;
  paid: number;
};

export type GrowthStats = {
  totalStudents: number;
  free: number;
  core: number;
  max: number;
  paid: number;
  conversionRate: number;
  newLast7Days: number;
  newPrevious7Days: number;
  newLast30Days: number;
  weeks: GrowthWeekBucket[];
};

// Test/QA accounts (isTestAccount) aren't real signups and would skew growth
// numbers, so they're excluded from every stat this module computes.
function realStudents(students: StudentRow[]): StudentRow[] {
  return students.filter((s) => !s.isTestAccount);
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= start.getTime() && t < end.getTime();
}

export function computeGrowthStats(
  students: StudentRow[],
  now: Date = new Date(),
  weekCount = 12,
): GrowthStats {
  const real = realStudents(students);
  const free = real.filter((s) => s.plan === "free").length;
  const core = real.filter((s) => s.plan === "core").length;
  const max = real.filter((s) => s.plan === "max").length;
  const totalStudents = real.length;
  const paid = core + max;

  const dayMs = 24 * 60 * 60 * 1000;
  const last7Start = new Date(now.getTime() - 7 * dayMs);
  const prev7Start = new Date(now.getTime() - 14 * dayMs);
  const last30Start = new Date(now.getTime() - 30 * dayMs);

  const newLast7Days = real.filter((s) => s.joined && inRange(s.joined, last7Start, now)).length;
  const newPrevious7Days = real.filter((s) => s.joined && inRange(s.joined, prev7Start, last7Start)).length;
  const newLast30Days = real.filter((s) => s.joined && inRange(s.joined, last30Start, now)).length;

  const weeks: GrowthWeekBucket[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * dayMs);
    const start = new Date(end.getTime() - 7 * dayMs);
    weeks.push({
      weekStart: start.toISOString().slice(0, 10),
      free: real.filter((s) => s.joined && s.plan === "free" && inRange(s.joined, start, end)).length,
      paid: real.filter((s) => s.joined && s.plan !== "free" && inRange(s.joined, start, end)).length,
    });
  }

  return {
    totalStudents,
    free,
    core,
    max,
    paid,
    conversionRate: totalStudents > 0 ? paid / totalStudents : 0,
    newLast7Days,
    newPrevious7Days,
    newLast30Days,
    weeks,
  };
}
