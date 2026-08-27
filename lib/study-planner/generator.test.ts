import assert from "node:assert/strict";
import test from "node:test";
import type { Course } from "@/lib/courses/types";
import type { CompletedTestAttempt } from "@/lib/gamification/state";
import type { MathBankCatalog, MathSkillMetric } from "@/lib/question-bank/math";
import type {
  ReadingWritingBankCatalog,
  ReadingWritingSkillMetric,
} from "@/lib/question-bank/reading-writing";
import { generateStudyPlan, type GenerateStudyPlanInput } from "./generator";

const NOW = new Date("2026-08-21T02:30:00.000Z"); // Aug 20 in America/New_York.

test("anchors the seven-day plan to New York today and stops at the SAT date", () => {
  const plan = generateStudyPlan(input({
    profile: profile({ testDate: "2026-08-24" }),
  }));

  assert.equal(plan.startsOn, "2026-08-20");
  assert.equal(plan.endsOn, "2026-08-24");
  assert.equal(plan.daysToTest, 4);
  assert.ok(plan.tasks.every((task) => task.date >= plan.startsOn && task.date <= plan.endsOn));
});

test("returns a safe empty taper snapshot when the saved SAT date has passed", () => {
  const plan = generateStudyPlan(input({
    profile: profile({ testDate: "2026-08-19", currentScore: 1300 }),
  }));

  assert.equal(plan.startsOn, "2026-08-20");
  assert.equal(plan.endsOn, "2026-08-20");
  assert.equal(plan.phase, "taper");
  assert.equal(plan.daysToTest, 0);
  assert.deepEqual(plan.tasks, []);
});

test("selects phases from both score evidence and time remaining", () => {
  const cases = [
    { testDate: "2026-09-20", currentScore: null, goalScore: 1500, phase: "baseline" },
    { testDate: "2026-09-20", currentScore: 1100, goalScore: 1500, phase: "foundation" },
    { testDate: "2026-09-20", currentScore: 1350, goalScore: 1500, phase: "build" },
    { testDate: "2026-08-30", currentScore: 1350, goalScore: 1500, phase: "test_ready" },
    { testDate: "2026-08-23", currentScore: null, goalScore: 1500, phase: "taper" },
  ] as const;

  for (const example of cases) {
    const plan = generateStudyPlan(input({
      profile: profile(example),
    }));
    assert.equal(plan.phase, example.phase);
  }
});

test("uses the independently timestamped score signal that is actually newest", () => {
  const manualScorePlan = generateStudyPlan(input({
    profile: profile({
      currentScore: 1420,
      scoreUpdatedAt: "2026-08-20T20:00:00.000Z",
    }),
    testAttempts: [attempt({
      totalScore: 1280,
      createdAt: "2026-08-19T16:00:00.000Z",
    })],
  }));
  const testScorePlan = generateStudyPlan(input({
    profile: profile({
      currentScore: 1420,
      scoreUpdatedAt: "2026-08-01T20:00:00.000Z",
    }),
    testAttempts: [attempt({
      totalScore: 1280,
      createdAt: "2026-08-19T16:00:00.000Z",
    })],
  }));

  assert.equal(manualScorePlan.currentScore, 1420);
  assert.equal(testScorePlan.currentScore, 1280);
});

test("schedules a due full test on the preferred weekday even when it is not a study day", () => {
  const plan = generateStudyPlan(input({
    profile: profile({
      testDate: "2026-10-01",
      currentScore: null,
      studyDays: [1, 2, 3, 4, 5],
      practiceTestDay: 6,
    }),
  }));
  const fullTest = plan.tasks.find((task) => task.kind === "full_test");

  assert.equal(fullTest?.date, "2026-08-22");
  assert.equal(fullTest?.estimatedMinutes, 134);
  assert.equal(fullTest?.testSlug, "practice-test-6");
  assert.equal(fullTest?.href, "/practice-test/practice-test-6?workspace=ultimate");
});

test("never puts a full simulation inside the final five days", () => {
  const plan = generateStudyPlan(input({
    profile: profile({
      testDate: "2026-08-25",
      currentScore: 1300,
      studyDays: [4, 5],
      practiceTestDay: 6,
    }),
  }));

  assert.equal(plan.phase, "taper");
  assert.equal(plan.tasks.some((task) => task.kind === "full_test"), false);
});

test("keeps the taper light and makes the day-before set exactly five questions", () => {
  const plan = generateStudyPlan(input({
    profile: profile({
      testDate: "2026-08-25",
      currentScore: 1300,
      dailyMinutes: 180,
      studyDays: [0, 1, 2, 3, 4, 5, 6],
    }),
    courses: [courseWithLesson(
      "Solving linear equations",
      15,
      "/ultimate/bank/math/practice?skills=Linear%20equations",
    )],
  }));
  const minutesByDate = new Map<string, number>();
  for (const task of plan.tasks) {
    minutesByDate.set(task.date, (minutesByDate.get(task.date) ?? 0) + task.estimatedMinutes);
  }

  assert.equal(plan.tasks.some((task) => task.kind === "course_lesson"), false);
  assert.ok([...minutesByDate.values()].every((minutes) => minutes <= 20));
  const dayBefore = plan.tasks.find((task) => task.date === "2026-08-24");
  assert.equal(dayBefore?.targetCount, 5);
  assert.equal(dayBefore?.estimatedMinutes, 10);
});

test("puts the lower-scoring section first while keeping every weekly skill unique", () => {
  const plan = generateStudyPlan(input({
    profile: profile({ currentScore: 1220, practiceTestDay: 0 }),
    mathCatalog: mathCatalog([
      mathSkill("Linear equations", { accuracy: 42, attempts: 12, attempted: 10 }),
      mathSkill("Quadratics", { accuracy: null, attempts: 0, attempted: 0 }),
      mathSkill("Percents", { accuracy: 88, attempts: 12, attempted: 10 }),
      mathSkill("Circles", { accuracy: 61, attempts: 8, attempted: 8 }),
    ]),
    readingWritingCatalog: readingCatalog([
      readingSkill("Transitions", { accuracy: 35, attempts: 12, attempted: 10 }),
      readingSkill("Boundaries", { accuracy: null, attempts: 0, attempted: 0 }),
      readingSkill("Inferences", { accuracy: 82, attempts: 10, attempted: 8 }),
    ]),
    testAttempts: [attempt({
      totalScore: 1220,
      rwScore: 700,
      mathScore: 520,
      createdAt: "2026-08-19T16:00:00.000Z",
    })],
  }));
  const skillTasks = plan.tasks.filter((task) => task.skill !== null);

  assert.equal(skillTasks[0]?.section, "math");
  assert.equal(skillTasks[0]?.skill, "Linear equations");
  assert.equal(new Set(skillTasks.map((task) => task.skill)).size, skillTasks.length);
  assert.ok(skillTasks.some((task) => task.skill === "Linear equations"));
  assert.ok(skillTasks.some((task) => task.skill === "Quadratics"));
});

test("pairs a lesson with its real linked practice skill and emits a validated exact set", () => {
  const plan = generateStudyPlan(input({
    profile: profile({ currentScore: 1250, dailyMinutes: 45 }),
    mathCatalog: mathCatalog([
      mathSkill("Quadratics", { accuracy: 90, attempts: 10, attempted: 8 }),
      mathSkill("Linear equations", { accuracy: 30, attempts: 10, attempted: 5 }),
    ]),
    readingWritingCatalog: readingCatalog([]),
    courses: [courseWithLesson(
      "Solving linear equations",
      15,
      "/ultimate/bank/math/practice?skills=Linear%20equations&limit=999",
    )],
    testAttempts: [attempt({ createdAt: "2026-08-19T16:00:00.000Z" })],
  }));
  const lesson = plan.tasks.find((task) => task.kind === "course_lesson");
  const sameDayPractice = plan.tasks.find((task) => (
    task.kind === "question_bank" && task.date === lesson?.date
  ));

  assert.equal(sameDayPractice?.skill, "Linear equations");
  assert.match(sameDayPractice?.href ?? "", /^\/ultimate\/bank\/math\/practice\?/);
  const url = new URL(sameDayPractice?.href ?? "", "https://example.com");
  assert.equal(url.searchParams.get("skills"), "Linear equations");
  assert.equal(url.searchParams.get("limit"), String(sameDayPractice?.targetCount));
  assert.equal(url.searchParams.get("from"), "planner");
  assert.equal(url.searchParams.get("difficulty"), "easy");
  assert.ok((sameDayPractice?.targetCount ?? 0) >= 5);
  assert.ok((sameDayPractice?.targetCount ?? 31) <= 30);
});

test("keeps ordinary study days within the student's time budget", () => {
  const plan = generateStudyPlan(input({
    profile: profile({ currentScore: 1250, dailyMinutes: 35, practiceTestDay: 0 }),
    mathCatalog: mathCatalog([
      mathSkill("Linear equations"),
      mathSkill("Quadratics"),
      mathSkill("Percents"),
      mathSkill("Circles"),
    ]),
    readingWritingCatalog: readingCatalog([
      readingSkill("Transitions"),
      readingSkill("Boundaries"),
      readingSkill("Inferences"),
    ]),
    courses: [courseWithLesson("Core method", 15, null)],
    testAttempts: [attempt({ createdAt: "2026-08-19T16:00:00.000Z" })],
  }));
  const minutesByDate = new Map<string, number>();
  for (const task of plan.tasks.filter((candidate) => candidate.kind !== "full_test")) {
    minutesByDate.set(task.date, (minutesByDate.get(task.date) ?? 0) + task.estimatedMinutes);
  }

  assert.ok([...minutesByDate.values()].every((minutes) => minutes <= 35));
  assert.equal(plan.totalMinutes, plan.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0));
});

test("suppresses a full test when the student completed one too recently", () => {
  const plan = generateStudyPlan(input({
    profile: profile({ currentScore: 1250, practiceTestDay: 6 }),
    testAttempts: [attempt({ createdAt: "2026-08-19T17:00:00.000Z" })],
  }));

  assert.equal(plan.tasks.some((task) => task.kind === "full_test"), false);
});

test("uses a fourteen-day full-test cadence when the SAT is more than eight weeks away", () => {
  const tooSoon = generateStudyPlan(input({
    profile: profile({ testDate: "2026-12-01", currentScore: 1250, practiceTestDay: 6 }),
    testAttempts: [attempt({ createdAt: "2026-08-10T17:00:00.000Z" })],
  }));
  const dueOnScheduledDay = generateStudyPlan(input({
    profile: profile({ testDate: "2026-12-01", currentScore: 1250, practiceTestDay: 6 }),
    testAttempts: [attempt({ createdAt: "2026-08-08T17:00:00.000Z" })],
  }));

  assert.equal(tooSoon.phase, "foundation");
  assert.equal(tooSoon.tasks.some((task) => task.kind === "full_test"), false);
  assert.equal(dueOnScheduledDay.tasks.find((task) => task.kind === "full_test")?.date, "2026-08-22");
});

test("chooses an unattempted full test, then the least-recently attempted test", () => {
  const unattemptedPlan = generateStudyPlan(input({
    profile: profile({ currentScore: 1250 }),
    testAttempts: [attempt({ testSlug: "practice-test-6" })],
    tests: [
      { slug: "practice-test-6", title: "Practice Test 6" },
      { slug: "practice-test-7", title: "Practice Test 7" },
    ],
  }));
  assert.equal(
    unattemptedPlan.tasks.find((task) => task.kind === "full_test")?.testSlug,
    "practice-test-7",
  );

  const retakePlan = generateStudyPlan(input({
    profile: profile({ currentScore: 1250 }),
    testAttempts: [
      attempt({ id: "attempt-6", testSlug: "practice-test-6", createdAt: "2026-07-01T12:00:00.000Z" }),
      attempt({ id: "attempt-7", testSlug: "practice-test-7", createdAt: "2026-07-10T12:00:00.000Z" }),
    ],
    tests: [
      { slug: "practice-test-6", title: "Practice Test 6" },
      { slug: "practice-test-7", title: "Practice Test 7" },
    ],
  }));
  assert.equal(
    retakePlan.tasks.find((task) => task.kind === "full_test")?.testSlug,
    "practice-test-6",
  );
});

test("does not pair a weakness with an unrelated course when skill evidence exists", () => {
  const plan = generateStudyPlan(input({
    profile: profile({ currentScore: 1250 }),
    mathCatalog: mathCatalog([
      mathSkill("Quadratics", { accuracy: 45, attempts: 12, attempted: 10 }),
    ]),
    readingWritingCatalog: readingCatalog([]),
    courses: [courseWithLesson("Unrelated lesson", 15, null)],
    testAttempts: [attempt({ createdAt: "2026-08-19T16:00:00.000Z" })],
  }));

  assert.equal(plan.tasks.some((task) => task.kind === "course_lesson"), false);
  assert.ok(plan.tasks.some((task) => task.kind === "question_bank" && task.skill === "Quadratics"));
});

test("reserves a weak skill for review on the first study day after a full test", () => {
  const plan = generateStudyPlan(input({
    profile: profile({
      currentScore: null,
      studyDays: [1, 5],
      practiceTestDay: 6,
    }),
    mathCatalog: mathCatalog([
      mathSkill("Linear equations", { accuracy: 50, attempts: 8, attempted: 8 }),
    ]),
    readingWritingCatalog: readingCatalog([]),
  }));
  const review = plan.tasks.find((task) => task.kind === "review");

  assert.equal(review?.date, "2026-08-24");
  assert.equal(review?.skill, "Linear equations");
  assert.equal(plan.tasks.some((task) => task.date === "2026-08-21" && task.skill === "Linear equations"), false);
  assert.equal(review?.progress.completed, 0);
  assert.equal(review?.completed, false);
});

function input(overrides: Partial<GenerateStudyPlanInput> = {}): GenerateStudyPlanInput {
  return {
    email: "student@example.com",
    profile: profile(),
    mathCatalog: mathCatalog([
      mathSkill("Linear equations"),
      mathSkill("Quadratics"),
      mathSkill("Percents"),
      mathSkill("Circles"),
    ]),
    readingWritingCatalog: readingCatalog([
      readingSkill("Transitions"),
      readingSkill("Boundaries"),
      readingSkill("Inferences"),
    ]),
    courses: [],
    testAttempts: [],
    tests: [
      { slug: "practice-test-6", title: "Practice Test 6" },
      { slug: "practice-test-7", title: "Practice Test 7" },
    ],
    now: NOW,
    planId: "plan-1",
    ...overrides,
  };
}

function profile(overrides: Partial<GenerateStudyPlanInput["profile"]> = {}): GenerateStudyPlanInput["profile"] {
  return {
    testDate: "2026-10-01",
    currentScore: null,
    scoreUpdatedAt: null,
    goalScore: 1500,
    studyDays: [0, 1, 2, 3, 4, 5, 6],
    practiceTestDay: 6,
    dailyMinutes: 45,
    ...overrides,
  };
}

function mathCatalog(skills: MathSkillMetric[]): MathBankCatalog {
  return {
    totalAvailable: skills.reduce((sum, skill) => sum + skill.available, 0),
    totalAttempted: skills.reduce((sum, skill) => sum + skill.attempted, 0),
    skills,
  };
}

function readingCatalog(skills: ReadingWritingSkillMetric[]): ReadingWritingBankCatalog {
  return {
    totalAvailable: skills.reduce((sum, skill) => sum + skill.available, 0),
    totalAttempted: skills.reduce((sum, skill) => sum + skill.attempted, 0),
    skills,
  };
}

function mathSkill(
  name: string,
  overrides: Partial<MathSkillMetric> = {},
): MathSkillMetric {
  return {
    domain: "Algebra",
    name,
    sort: 1,
    available: 40,
    attempted: 0,
    attempts: 0,
    correct: 0,
    accuracy: null,
    ...overrides,
  };
}

function readingSkill(
  name: ReadingWritingSkillMetric["name"],
  overrides: Partial<ReadingWritingSkillMetric> = {},
): ReadingWritingSkillMetric {
  return {
    domain: "Standard English Conventions",
    name,
    sort: 1,
    available: 40,
    attempted: 0,
    attempts: 0,
    correct: 0,
    accuracy: null,
    ...overrides,
  };
}

function attempt(overrides: Partial<CompletedTestAttempt> = {}): CompletedTestAttempt {
  return {
    id: "attempt-1",
    testSlug: "practice-test-6",
    totalScore: 1250,
    rwScore: 630,
    mathScore: 620,
    createdAt: "2026-08-01T16:00:00.000Z",
    ...overrides,
  };
}

function courseWithLesson(title: string, minutes: number, practiceUrl: string | null): Course {
  return {
    id: "course-1",
    slug: "blueprint-foundations",
    title: "Blueprint Foundations",
    description: null,
    eyebrow: null,
    coverUrl: null,
    coverZoom: 1,
    position: 1,
    estimatedMinutes: minutes,
    status: "published",
    completedLessons: 0,
    totalLessons: 1,
    progress: 0,
    modules: [{
      id: "module-1",
      slug: "algebra",
      title: "Algebra",
      description: null,
      position: 1,
      status: "published",
      lessons: [{
        id: "lesson-1",
        slug: "linear-equations",
        title,
        summary: "Learn the setup and apply it cleanly.",
        position: 1,
        estimatedMinutes: minutes,
        status: "published",
        completed: false,
        blocks: practiceUrl ? [{
          id: "block-1",
          position: 1,
          kind: "file",
          content: { url: practiceUrl },
        }] : [],
      }],
    }],
  };
}
