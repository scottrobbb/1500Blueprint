import type { Course } from "@/lib/courses/types";
import type { CompletedTestAttempt } from "@/lib/gamification/state";
import type { MathBankCatalog } from "@/lib/question-bank/math";
import type { ReadingWritingBankCatalog } from "@/lib/question-bank/reading-writing";
import type { StudyPlannerProfile } from "./profile";

const DAY_MS = 86_400_000;
const PLAN_DAYS = 7;
const FULL_TEST_MINUTES = 134;
const MIN_QUESTION_LIMIT = 5;
const MAX_QUESTION_LIMIT = 30;

export type StudyPlanPhase = "baseline" | "foundation" | "build" | "test_ready" | "taper";
export type StudyPlanSection = "rw" | "math";
export type StudyPlanTaskKind = "question_bank" | "course_lesson" | "full_test" | "review";

export type StudyPlanProgress = {
  completed: number;
  target: number;
  percent: number;
};

export type StudyPlanFocus = {
  section: StudyPlanSection;
  domain: string;
  skill: string;
  accuracy: number | null;
  attempts: number;
  available: number;
  reason: string;
};

export type StudyPlanScoreRunway = {
  currentScore: number | null;
  goalScore: number;
  gap: number | null;
  daysToTest: number;
  pointsPerWeek: number | null;
  latestAttemptAt: string | null;
  rwScore: number | null;
  mathScore: number | null;
};

export type StudyPlanTask = {
  id: string;
  date: string;
  position: number;
  kind: StudyPlanTaskKind;
  section: StudyPlanSection | null;
  skill: string | null;
  title: string;
  description: string;
  reason: string;
  href: string;
  estimatedMinutes: number;
  targetCount: number;
  courseLessonId: string | null;
  testSlug: string | null;
  progress: StudyPlanProgress;
  completed: boolean;
};

export type StudyPlan = {
  id: string;
  email: string;
  generatedAt: string;
  startsOn: string;
  endsOn: string;
  testDate: string;
  phase: StudyPlanPhase;
  goalScore: number;
  currentScore: number | null;
  scoreGap: number | null;
  daysToTest: number;
  scoreRunway: StudyPlanScoreRunway;
  focusAreas: StudyPlanFocus[];
  totalMinutes: number;
  tasks: StudyPlanTask[];
  progress: StudyPlanProgress;
};

export type GenerateStudyPlanInput = {
  email: string;
  profile: Pick<
    StudyPlannerProfile,
    "testDate" | "currentScore" | "scoreUpdatedAt" | "goalScore" | "studyDays" | "practiceTestDay" | "dailyMinutes"
  >;
  mathCatalog: MathBankCatalog | null;
  readingWritingCatalog: ReadingWritingBankCatalog | null;
  courses: Course[];
  testAttempts: CompletedTestAttempt[];
  tests?: { slug: string; title: string }[];
  now?: Date;
  planId?: string;
};

type SkillCandidate = StudyPlanFocus & {
  attempted: number;
  priority: number;
};

type LessonCandidate = {
  id: string;
  title: string;
  summary: string | null;
  href: string;
  estimatedMinutes: number;
  linkedPractices: LinkedPractice[];
};

type LinkedPractice = {
  section: StudyPlanSection;
  skill: string;
};

export function generateStudyPlan(input: GenerateStudyPlanInput): StudyPlan {
  const now = input.now ?? new Date();
  const startsOn = todayInNewYork(now);
  const testDateExpired = input.profile.testDate < startsOn;
  const daysToTest = Math.max(0, differenceInDays(startsOn, input.profile.testDate));
  const endsOn = testDateExpired
    ? startsOn
    : minDate(addDays(startsOn, PLAN_DAYS - 1), input.profile.testDate);
  const generatedAt = now.toISOString();
  const planId = input.planId ?? `draft-${startsOn}`;
  const latestAttempt = latestScoredAttempt(input.testAttempts);
  const currentScore = effectiveCurrentScore(input.profile, latestAttempt);
  const scoreGap = currentScore === null ? null : Math.max(0, input.profile.goalScore - currentScore);
  const phase = determinePhase(daysToTest, currentScore, scoreGap);
  const lowerSection = lowerScoringSection(latestAttempt);
  const candidates = rankSkills(input.mathCatalog, input.readingWritingCatalog, lowerSection);
  const lessons = unfinishedLessons(input.courses);
  const fullTestDate = chooseFullTestDate({
    startsOn,
    endsOn,
    testDate: input.profile.testDate,
    preferredDay: input.profile.practiceTestDay,
    phase,
    attempts: input.testAttempts,
  });
  const fullTest = chooseFullTest(input.tests ?? [], input.testAttempts);
  const tasks: StudyPlanTask[] = [];
  const usedSkills = new Set<string>();
  const usedLessonIds = new Set<string>();
  let focusCursor = 0;
  const hasPerformanceEvidence = latestAttempt !== null || candidates.some((candidate) => candidate.attempts > 0);
  const postTestReviewDate = fullTestDate
    ? datesBetween(startsOn, endsOn).find((date) => (
      date > fullTestDate
      && date !== input.profile.testDate
      && input.profile.studyDays.includes(weekdayOf(date))
    )) ?? null
    : null;
  const reservedReviewFocus = postTestReviewDate ? candidates[0] ?? null : null;

  function takeFocus(forPostTestReview: boolean): SkillCandidate | null {
    if (forPostTestReview && reservedReviewFocus) {
      const key = weeklySkillKey(reservedReviewFocus.skill);
      if (!usedSkills.has(key)) {
        usedSkills.add(key);
        return reservedReviewFocus;
      }
    }
    while (focusCursor < candidates.length) {
      const candidate = candidates[focusCursor];
      focusCursor += 1;
      const key = weeklySkillKey(candidate.skill);
      if (reservedReviewFocus && key === weeklySkillKey(reservedReviewFocus.skill)) continue;
      if (usedSkills.has(key)) continue;
      usedSkills.add(key);
      return candidate;
    }
    return null;
  }

  function addTask(task: Omit<StudyPlanTask, "id" | "position" | "progress" | "completed">) {
    const position = tasks.length + 1;
    tasks.push({
      ...task,
      id: `${planId}-task-${position}`,
      position,
      progress: progress(0, task.targetCount),
      completed: false,
    });
  }

  for (const date of testDateExpired ? [] : datesBetween(startsOn, endsOn)) {
    if (date === fullTestDate) {
      addTask({
        date,
        kind: "full_test",
        section: null,
        skill: null,
        title: fullTest
          ? `${phase === "baseline" ? "Establish your baseline" : "Full simulation"}: ${fullTest.title}`
          : phase === "baseline" ? "Establish your SAT baseline" : "Run a full Bluebook simulation",
        description: "Complete all four adaptive modules under official timing, then use the score report to steer the next plan.",
        reason: fullTestReason(phase, latestAttempt),
        href: fullTest
          ? `/practice-test/${encodeURIComponent(fullTest.slug)}?workspace=ultimate`
          : "/ultimate/tests",
        estimatedMinutes: FULL_TEST_MINUTES,
        targetCount: 1,
        courseLessonId: null,
        testSlug: fullTest?.slug ?? null,
      });
      continue;
    }

    const weekday = weekdayOf(date);
    if (!input.profile.studyDays.includes(weekday) || date === input.profile.testDate) continue;

    const daysBeforeTest = differenceInDays(date, input.profile.testDate);
    const configuredBudget = clamp(Math.round(input.profile.dailyMinutes), 20, 180);
    const dailyBudget = phase === "taper"
      ? daysBeforeTest === 1 ? 10 : Math.min(configuredBudget, 20)
      : configuredBudget;
    let remainingMinutes = dailyBudget;
    const isPostTestDay = date === postTestReviewDate;
    const focus = takeFocus(isPostTestDay);
    const matchedLesson = phase !== "taper" && focus
      ? matchingLesson(lessons, usedLessonIds, focus, remainingMinutes - 10)
      : null;
    const lesson = matchedLesson ?? (phase !== "taper" && !hasPerformanceEvidence
      ? genericLesson(lessons, usedLessonIds, remainingMinutes - (focus ? 10 : 0))
      : null);

    if (lesson) {
      usedLessonIds.add(lesson.id);
      addTask({
        date,
        kind: "course_lesson",
        section: null,
        skill: null,
        title: lesson.title,
        description: lesson.summary ?? "Learn Scott's method, capture the key move, and apply it before leaving the lesson.",
        reason: courseReason(
          phase,
          focus ? { section: focus.section, skill: focus.skill } : lesson.linkedPractices[0] ?? null,
        ),
        href: lesson.href,
        estimatedMinutes: lesson.estimatedMinutes,
        targetCount: 1,
        courseLessonId: lesson.id,
        testSlug: null,
      });
      remainingMinutes -= lesson.estimatedMinutes;
    }

    if (focus && remainingMinutes >= 10) {
      const targetCount = questionTarget(focus, isPostTestDay ? Math.min(remainingMinutes, 30) : remainingMinutes, isPostTestDay);
      if (targetCount >= MIN_QUESTION_LIMIT) {
        const estimatedMinutes = targetCount * 2;
        const completion = isPostTestDay
          ? focus.attempts >= MIN_QUESTION_LIMIT ? "attempted" : "all"
          : focus.available - focus.attempted >= MIN_QUESTION_LIMIT ? "unanswered" : "all";
        const kind = isPostTestDay ? "review" : "question_bank";
        addTask({
          date,
          kind,
          section: focus.section,
          skill: focus.skill,
          title: isPostTestDay ? `Review ${focus.skill}` : `${focus.skill}: ${targetCount}-question set`,
          description: isPostTestDay
            ? `Work ${targetCount} ${sectionLabel(focus.section)} questions, checking every explanation against what happened on the full test.`
            : `Complete exactly ${targetCount} ${sectionLabel(focus.section)} questions and read the explanation after every miss.`,
          reason: isPostTestDay
            ? `Use fresh test evidence while it is still visible. ${focus.reason}`
            : focus.reason,
          href: questionBankHref(
            focus.section,
            focus.skill,
            targetCount,
            completion,
            difficultyFor(focus.accuracy),
          ),
          estimatedMinutes,
          targetCount,
          courseLessonId: null,
          testSlug: null,
        });
      }
    }
  }

  const selectedFocusKeys = new Set(
    tasks
      .filter((task) => task.section && task.skill)
      .map((task) => skillKey(task.section as StudyPlanSection, task.skill as string)),
  );
  const focusAreas = candidates
    .filter((candidate) => selectedFocusKeys.has(skillKey(candidate.section, candidate.skill)))
    .map((candidate): StudyPlanFocus => ({
      section: candidate.section,
      domain: candidate.domain,
      skill: candidate.skill,
      accuracy: candidate.accuracy,
      attempts: candidate.attempts,
      available: candidate.available,
      reason: candidate.reason,
    }));
  const totalMinutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);
  const scoreRunway: StudyPlanScoreRunway = {
    currentScore,
    goalScore: input.profile.goalScore,
    gap: scoreGap,
    daysToTest,
    pointsPerWeek: scoreGap === null || scoreGap === 0
      ? scoreGap
      : Math.max(1, Math.round(scoreGap / Math.max(daysToTest / 7, 1))),
    latestAttemptAt: latestAttempt?.createdAt ?? null,
    rwScore: latestAttempt?.rwScore ?? null,
    mathScore: latestAttempt?.mathScore ?? null,
  };

  return {
    id: planId,
    email: input.email,
    generatedAt,
    startsOn,
    endsOn,
    testDate: input.profile.testDate,
    phase,
    goalScore: input.profile.goalScore,
    currentScore,
    scoreGap,
    daysToTest,
    scoreRunway,
    focusAreas,
    totalMinutes,
    tasks,
    progress: progress(0, tasks.length),
  };
}

function determinePhase(
  daysToTest: number,
  currentScore: number | null,
  scoreGap: number | null,
): StudyPlanPhase {
  if (daysToTest <= 5) return "taper";
  if (currentScore === null) return "baseline";
  if (daysToTest <= 14) return "test_ready";
  if (currentScore < 1200 || (scoreGap ?? 0) >= 250 || daysToTest > 56) return "foundation";
  return "build";
}

function rankSkills(
  mathCatalog: MathBankCatalog | null,
  readingWritingCatalog: ReadingWritingBankCatalog | null,
  lowerSection: StudyPlanSection | null,
): SkillCandidate[] {
  const math = (mathCatalog?.skills ?? []).map((skill) => skillCandidate("math", skill));
  const readingWriting = (readingWritingCatalog?.skills ?? []).map((skill) => skillCandidate("rw", skill));
  const available = [...math, ...readingWriting]
    .filter((candidate) => candidate.available >= MIN_QUESTION_LIMIT)
    .sort(compareCandidates);

  const mathRanked = available.filter((candidate) => candidate.section === "math");
  const readingRanked = available.filter((candidate) => candidate.section === "rw");
  if (mathRanked.length === 0 || readingRanked.length === 0) return available;

  const firstSection = lowerSection ?? available[0]?.section ?? "math";
  const primary = firstSection === "math" ? mathRanked : readingRanked;
  const secondary = firstSection === "math" ? readingRanked : mathRanked;
  const pattern = lowerSection ? [primary, secondary, primary] : [primary, secondary];
  const balanced: SkillCandidate[] = [];
  let primaryIndex = 0;
  let secondaryIndex = 0;

  while (primaryIndex < primary.length || secondaryIndex < secondary.length) {
    let added = false;
    for (const list of pattern) {
      if (list === primary && primaryIndex < primary.length) {
        balanced.push(primary[primaryIndex++]);
        added = true;
      } else if (list === secondary && secondaryIndex < secondary.length) {
        balanced.push(secondary[secondaryIndex++]);
        added = true;
      }
    }
    if (!added) break;
  }
  return balanced;
}

function skillCandidate(
  section: StudyPlanSection,
  skill: {
    domain: string;
    name: string;
    available: number;
    attempted: number;
    attempts: number;
    accuracy: number | null;
  },
): SkillCandidate {
  const accuracyNeed = skill.accuracy === null ? 25 : 100 - skill.accuracy;
  const sampleNeed = Math.max(0, 6 - Math.min(6, skill.attempts)) * 5;
  const coverageNeed = skill.available === 0
    ? 0
    : Math.round(((skill.available - Math.min(skill.attempted, skill.available)) / skill.available) * 20);
  const persistentWeakness = skill.accuracy !== null && skill.attempts >= 3 && skill.accuracy < 70 ? 30 : 0;

  return {
    section,
    domain: skill.domain,
    skill: skill.name,
    accuracy: skill.accuracy,
    attempts: skill.attempts,
    attempted: skill.attempted,
    available: skill.available,
    priority: accuracyNeed + sampleNeed + coverageNeed + persistentWeakness,
    reason: focusReason(skill),
  };
}

function compareCandidates(left: SkillCandidate, right: SkillCandidate): number {
  return right.priority - left.priority
    || left.section.localeCompare(right.section)
    || left.domain.localeCompare(right.domain)
    || left.skill.localeCompare(right.skill);
}

function focusReason(skill: {
  name: string;
  attempts: number;
  accuracy: number | null;
  available: number;
  attempted: number;
}): string {
  if (skill.accuracy !== null && skill.attempts >= 3 && skill.accuracy < 75) {
    return `${skill.accuracy}% accuracy across ${skill.attempts} attempts makes this a high-leverage score gap.`;
  }
  if (skill.attempts === 0) {
    return `You have no accuracy evidence for ${skill.name} yet, so this set establishes a useful baseline.`;
  }
  if (skill.attempts < 6) {
    return `Only ${skill.attempts} ${skill.attempts === 1 ? "attempt" : "attempts"} so far; a larger sample will expose the pattern reliably.`;
  }
  const unseen = Math.max(0, skill.available - skill.attempted);
  return `${unseen} unattempted questions remain, giving you fresh evidence without recycling this week's other skills.`;
}

function unfinishedLessons(courses: Course[]): LessonCandidate[] {
  return [...courses]
    .filter((course) => course.status === "published")
    .sort((left, right) => left.position - right.position || left.title.localeCompare(right.title))
    .flatMap((course) => [...course.modules]
      .filter((module) => module.status === "published")
      .sort((left, right) => left.position - right.position)
      .flatMap((module) => [...module.lessons]
        .filter((lesson) => lesson.status === "published" && !lesson.completed)
        .sort((left, right) => left.position - right.position)
        .map((lesson): LessonCandidate => ({
          id: lesson.id,
          title: lesson.title,
          summary: lesson.summary,
          href: `/ultimate/courses/${encodeURIComponent(course.slug)}/${encodeURIComponent(lesson.slug)}`,
          estimatedMinutes: clamp(lesson.estimatedMinutes || 15, 5, 180),
          linkedPractices: uniqueLinkedPractices(
            lesson.blocks.flatMap((block) => linkedPractices(block.content.url)),
          ),
        }))));
}

function linkedPractices(value: string | undefined): LinkedPractice[] {
  if (!value) return [];
  let url: URL;
  try {
    url = new URL(value, "https://planner.local");
  } catch {
    return [];
  }
  const section = url.pathname === "/ultimate/bank/math/practice"
    ? "math"
    : url.pathname === "/ultimate/bank/reading-writing/practice"
      ? "rw"
      : null;
  if (!section) return [];
  return (url.searchParams.get("skills") ?? "")
    .split("|")
    .map((skill) => skill.trim())
    .filter(Boolean)
    .map((skill) => ({ section, skill }));
}

function uniqueLinkedPractices(practices: LinkedPractice[]): LinkedPractice[] {
  const seen = new Set<string>();
  return practices.filter((practice) => {
    const key = skillKey(practice.section, practice.skill);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchingLesson(
  lessons: LessonCandidate[],
  usedLessonIds: Set<string>,
  focus: SkillCandidate,
  availableMinutes: number,
): LessonCandidate | null {
  return lessons
    .filter((lesson) => (
      !usedLessonIds.has(lesson.id)
      && lesson.estimatedMinutes <= availableMinutes
      && lesson.linkedPractices.some((practice) => (
        practice.section === focus.section && practice.skill === focus.skill
      ))
    ))
    .sort((left, right) => (
      Number(right.estimatedMinutes <= 20) - Number(left.estimatedMinutes <= 20)
      || left.estimatedMinutes - right.estimatedMinutes
    ))[0] ?? null;
}

function genericLesson(
  lessons: LessonCandidate[],
  usedLessonIds: Set<string>,
  availableMinutes: number,
): LessonCandidate | null {
  return lessons
    .filter((lesson) => !usedLessonIds.has(lesson.id) && lesson.estimatedMinutes <= availableMinutes)
    .sort((left, right) => (
      Number(right.estimatedMinutes <= 20) - Number(left.estimatedMinutes <= 20)
      || left.estimatedMinutes - right.estimatedMinutes
    ))[0] ?? null;
}

function chooseFullTestDate(input: {
  startsOn: string;
  endsOn: string;
  testDate: string;
  preferredDay: number;
  phase: StudyPlanPhase;
  attempts: CompletedTestAttempt[];
}): string | null {
  if (input.phase === "taper") return null;
  const preferredDate = datesBetween(input.startsOn, input.endsOn)
    .find((date) => weekdayOf(date) === input.preferredDay && differenceInDays(date, input.testDate) > 5);
  if (!preferredDate) return null;

  const latest = latestScoredAttempt(input.attempts);
  if (!latest) return preferredDate;
  const elapsedByScheduledDate = Math.max(
    0,
    differenceInDays(todayInNewYork(new Date(latest.createdAt)), preferredDate),
  );
  const daysToTest = differenceInDays(input.startsOn, input.testDate);
  const minimumGap = daysToTest > 56 ? 14 : input.phase === "test_ready" ? 5 : 7;
  return elapsedByScheduledDate >= minimumGap ? preferredDate : null;
}

function chooseFullTest(
  tests: { slug: string; title: string }[],
  attempts: CompletedTestAttempt[],
): { slug: string; title: string } | null {
  const available = tests.filter((test) => test.slug.trim() && test.title.trim());
  if (available.length === 0) return null;
  const attemptedSlugs = new Set(attempts.map((attempt) => attempt.testSlug));
  const unattempted = available.find((test) => !attemptedSlugs.has(test.slug));
  if (unattempted) return unattempted;

  const lastAttemptBySlug = new Map<string, number>();
  for (const attempt of attempts) {
    const attemptedAt = Date.parse(attempt.createdAt);
    if (!Number.isFinite(attemptedAt)) continue;
    lastAttemptBySlug.set(
      attempt.testSlug,
      Math.max(lastAttemptBySlug.get(attempt.testSlug) ?? 0, attemptedAt),
    );
  }
  return [...available].sort((left, right) => (
    (lastAttemptBySlug.get(left.slug) ?? 0) - (lastAttemptBySlug.get(right.slug) ?? 0)
  ))[0] ?? null;
}

function latestScoredAttempt(attempts: CompletedTestAttempt[]): CompletedTestAttempt | null {
  return attempts
    .filter((attempt) => (
      (attempt.totalScore !== null || attempt.rwScore !== null || attempt.mathScore !== null)
      && Number.isFinite(Date.parse(attempt.createdAt))
    ))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
}

function effectiveCurrentScore(
  profile: Pick<StudyPlannerProfile, "currentScore" | "scoreUpdatedAt">,
  latestAttempt: CompletedTestAttempt | null,
): number | null {
  if (latestAttempt?.totalScore === null || !latestAttempt) return profile.currentScore;
  const manualScoreIsNewer = profile.currentScore !== null
    && profile.scoreUpdatedAt !== null
    && Date.parse(profile.scoreUpdatedAt) > Date.parse(latestAttempt.createdAt);
  return manualScoreIsNewer ? profile.currentScore : latestAttempt.totalScore;
}

function lowerScoringSection(attempt: CompletedTestAttempt | null): StudyPlanSection | null {
  if (attempt?.rwScore === null || attempt?.mathScore === null || !attempt) return null;
  if (attempt.rwScore === attempt.mathScore) return null;
  return attempt.rwScore < attempt.mathScore ? "rw" : "math";
}

function questionTarget(candidate: SkillCandidate, availableMinutes: number, review: boolean): number {
  const timeLimit = clamp(Math.floor(availableMinutes / 2), MIN_QUESTION_LIMIT, MAX_QUESTION_LIMIT);
  const inventory = review || candidate.available - candidate.attempted < MIN_QUESTION_LIMIT
    ? candidate.available
    : candidate.available - candidate.attempted;
  return Math.min(timeLimit, inventory);
}

function questionBankHref(
  section: StudyPlanSection,
  skill: string,
  limit: number,
  completion: "all" | "unanswered" | "attempted",
  difficulty: "easy" | "medium" | "hard" | "all",
): string {
  const params = new URLSearchParams({
    skills: skill,
    difficulty,
    completion,
    limit: String(clamp(limit, MIN_QUESTION_LIMIT, MAX_QUESTION_LIMIT)),
    from: "planner",
  });
  const subject = section === "math" ? "math" : "reading-writing";
  return `/ultimate/bank/${subject}/practice?${params.toString()}`;
}

function difficultyFor(accuracy: number | null): "easy" | "medium" | "hard" | "all" {
  if (accuracy === null) return "all";
  if (accuracy < 65) return "easy";
  if (accuracy <= 82) return "medium";
  return "hard";
}

function courseReason(phase: StudyPlanPhase, linkedPracticeValue: LinkedPractice | null): string {
  const application = linkedPracticeValue
    ? ` It is paired with the lesson's ${linkedPracticeValue.skill} practice link.`
    : "";
  if (phase === "foundation") return `Build the method before adding speed or difficulty.${application}`;
  if (phase === "baseline") return `Learn one concrete method while the planner gathers your first performance signals.${application}`;
  return `Close an unfinished curriculum step, then transfer the method into scored practice.${application}`;
}

function fullTestReason(phase: StudyPlanPhase, latestAttempt: CompletedTestAttempt | null): string {
  if (!latestAttempt || phase === "baseline") {
    return "A complete timed score is the strongest baseline for choosing what to study next.";
  }
  if (phase === "test_ready") {
    return "You are close enough to test day that pacing, endurance, and adaptive routing need a fresh check.";
  }
  return "At least a week has passed since your last full test, so this checkpoint can measure whether targeted work transferred.";
}

function progress(completed: number, target: number): StudyPlanProgress {
  const safeTarget = Math.max(0, target);
  const safeCompleted = clamp(completed, 0, safeTarget);
  return {
    completed: safeCompleted,
    target: safeTarget,
    percent: safeTarget === 0 ? 0 : Math.round((safeCompleted / safeTarget) * 100),
  };
}

function skillKey(section: StudyPlanSection, skill: string): string {
  return `${section}:${skill}`;
}

function weeklySkillKey(skill: string): string {
  return skill.trim().toLocaleLowerCase("en-US");
}

function sectionLabel(section: StudyPlanSection): string {
  return section === "math" ? "Math" : "Reading & Writing";
}

function todayInNewYork(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function datesBetween(start: string, end: string): string[] {
  const length = Math.max(0, differenceInDays(start, end)) + 1;
  return Array.from({ length }, (_, index) => addDays(start, index));
}

function addDays(date: string, days: number): string {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function differenceInDays(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS);
}

function weekdayOf(date: string): number {
  return parseDate(date).getUTCDay();
}

function parseDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid planner date: ${value}`);
  return parsed;
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
