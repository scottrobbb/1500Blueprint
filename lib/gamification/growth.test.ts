import assert from "node:assert/strict";
import test from "node:test";
import { computeGrowthStats } from "./growth";
import type { StudentRow } from "./state";

function student(overrides: Partial<StudentRow> & { plan: StudentRow["plan"]; joined: string | null }): StudentRow {
  return {
    id: overrides.email ?? "student@example.com",
    email: "student@example.com",
    name: "Student",
    initials: "S",
    accessSource: "free",
    legacyPlan: "free",
    subscriptionPlan: null,
    subscriptionStatus: null,
    subscriptionPeriodStart: null,
    subscriptionPeriodEnd: null,
    cancellationScheduledAt: null,
    pendingPlan: null,
    pendingCadence: null,
    pendingChangeEffectiveAt: null,
    grantPlan: null,
    grantSource: null,
    grantExpiresAt: null,
    isComplimentary: false,
    accountStatus: "active",
    isTestAccount: false,
    level: 1,
    xp: 0,
    streak: 0,
    lastActive: null,
    onboarded: true,
    perDrill: {},
    totalAttempted: 0,
    totalMastered: 0,
    bestTest: null,
    testsDone: 0,
    ...overrides,
  };
}

const NOW = new Date("2026-08-30T12:00:00.000Z");

test("counts students by current plan and derives the paid conversion rate", () => {
  const students = [
    student({ plan: "free", joined: "2026-01-01T00:00:00.000Z" }),
    student({ plan: "free", joined: "2026-01-02T00:00:00.000Z" }),
    student({ plan: "core", joined: "2026-01-03T00:00:00.000Z" }),
    student({ plan: "max", joined: "2026-01-04T00:00:00.000Z" }),
  ];
  const stats = computeGrowthStats(students, NOW);
  assert.equal(stats.totalStudents, 4);
  assert.equal(stats.free, 2);
  assert.equal(stats.core, 1);
  assert.equal(stats.max, 1);
  assert.equal(stats.paid, 2);
  assert.equal(stats.conversionRate, 0.5);
});

test("excludes test accounts from every stat", () => {
  const students = [
    student({ plan: "max", joined: "2026-08-29T00:00:00.000Z", isTestAccount: true }),
    student({ plan: "free", joined: "2026-08-29T00:00:00.000Z" }),
  ];
  const stats = computeGrowthStats(students, NOW);
  assert.equal(stats.totalStudents, 1);
  assert.equal(stats.max, 0);
  assert.equal(stats.newLast7Days, 1);
});

test("excludes complimentary Max access from subscriber and conversion totals", () => {
  const students = [
    student({ plan: "max", joined: "2026-08-29T00:00:00.000Z", isComplimentary: true }),
    student({ plan: "max", joined: "2026-08-29T00:00:00.000Z" }),
    student({ plan: "free", joined: "2026-08-29T00:00:00.000Z" }),
  ];
  const stats = computeGrowthStats(students, NOW);
  assert.equal(stats.totalStudents, 3);
  assert.equal(stats.max, 1);
  assert.equal(stats.paid, 1);
  assert.equal(stats.conversionRate, 1 / 3);
  assert.equal(stats.weeks.at(-1)?.paid, 1);
});

test("buckets new signups into the correct 7-day windows", () => {
  const students = [
    student({ plan: "free", joined: "2026-08-29T00:00:00.000Z" }), // 1 day ago -- last 7
    student({ plan: "core", joined: "2026-08-24T00:00:00.000Z" }), // 6 days ago -- last 7
    student({ plan: "free", joined: "2026-08-20T00:00:00.000Z" }), // 10 days ago -- previous 7, not last 7
    student({ plan: "max", joined: "2026-07-15T00:00:00.000Z" }), // >30 days ago -- neither window
  ];
  const stats = computeGrowthStats(students, NOW);
  assert.equal(stats.newLast7Days, 2);
  assert.equal(stats.newPrevious7Days, 1);
  assert.equal(stats.newLast30Days, 3);
});

test("weekly buckets split free vs paid and cover the requested number of weeks", () => {
  const students = [
    student({ plan: "free", joined: "2026-08-29T00:00:00.000Z" }),
    student({ plan: "max", joined: "2026-08-28T00:00:00.000Z" }),
  ];
  const stats = computeGrowthStats(students, NOW, 3);
  assert.equal(stats.weeks.length, 3);
  const lastWeek = stats.weeks[stats.weeks.length - 1];
  assert.equal(lastWeek.free, 1);
  assert.equal(lastWeek.paid, 1);
  assert.equal(stats.weeks[0].free + stats.weeks[0].paid, 0);
});

test("a student with no join date is never counted in a time window", () => {
  const stats = computeGrowthStats([student({ plan: "free", joined: null })], NOW);
  assert.equal(stats.totalStudents, 1);
  assert.equal(stats.newLast7Days, 0);
  assert.equal(stats.weeks.every((w) => w.free === 0 && w.paid === 0), true);
});
