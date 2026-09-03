import "server-only";

import { listCoursesForStudentStrict } from "@/lib/courses/queries";
import type { CompletedTestAttempt } from "@/lib/gamification/state";
import { getMathBankCatalog } from "@/lib/question-bank/math-queries";
import { getReadingWritingBankCatalog } from "@/lib/question-bank/reading-writing-queries";
import { listTests } from "@/lib/sat/loadTest";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { reportServerError } from "@/lib/observability/server";
import type { StudyPlannerProfile } from "./profile";
import { rescheduleTasks, sameSchedule, type StudyPlanEdit } from "./reschedule";
import { loadPinnedQuestionIds } from "./task-questions";
import {
  generateStudyPlan,
  withPlannerTaskId,
  type StudyPlan,
  type StudyPlanCompression,
  type StudyPlanFocus,
  type StudyPlanPhase,
  type StudyPlanProgress,
  type StudyPlanScoreRunway,
  type StudyPlanSection,
  type StudyPlanTask,
  type StudyPlanTaskKind,
} from "./generator";

export { generateStudyPlan } from "./generator";
export type { StudyPlanEdit } from "./reschedule";
export type {
  GenerateStudyPlanInput,
  StudyPlan,
  StudyPlanCompression,
  StudyPlanFocus,
  StudyPlanPhase,
  StudyPlanProgress,
  StudyPlanScoreRunway,
  StudyPlanSection,
  StudyPlanSettings,
  StudyPlanTask,
  StudyPlanTaskKind,
} from "./generator";

type PlanRow = {
  id: string;
  email: string;
  generated_at: string;
  starts_on: string;
  ends_on: string;
  test_date: string;
  finish_by: string | null;
  phase: string;
  goal_score: number;
  current_score: number | null;
  score_gap: number | null;
  days_to_test: number;
  score_runway: StudyPlanScoreRunway;
  focus_areas: StudyPlanFocus[];
  total_minutes: number;
  study_days: number[];
  daily_minutes: number;
  practice_test_day: number;
  compression: StudyPlanCompression | null;
  customized_at: string | null;
  profile_updated_at: string;
};

type TaskRow = {
  id: string;
  task_date: string;
  position: number;
  kind: string;
  section: string | null;
  skill: string | null;
  title: string;
  description: string;
  reason: string;
  href: string;
  estimated_minutes: number;
  target_count: number;
  course_lesson_id: string | null;
  test_slug: string | null;
};

type QuestionAttemptRow = {
  question_id: string;
  section: string;
  skill: string | null;
};

type LessonCompletionRow = {
  lesson_id: string;
};

type TestEvidenceRow = {
  id: string;
  test_slug: string;
  created_at: string;
  completed_at: string | null;
};

type TestSignalRow = TestEvidenceRow & {
  total_score: number | null;
  rw_score: number | null;
  math_score: number | null;
};

type TestCatalogRow = {
  slug: string;
  title: string;
};

const PLAN_COLUMNS = [
  "id",
  "email",
  "generated_at",
  "starts_on",
  "ends_on",
  "test_date",
  "finish_by",
  "phase",
  "goal_score",
  "current_score",
  "score_gap",
  "days_to_test",
  "score_runway",
  "focus_areas",
  "total_minutes",
  "study_days",
  "daily_minutes",
  "practice_test_day",
  "compression",
  "customized_at",
  "profile_updated_at",
].join(",");

const TASK_COLUMNS = [
  "id",
  "task_date",
  "position",
  "kind",
  "section",
  "skill",
  "title",
  "description",
  "reason",
  "href",
  "estimated_minutes",
  "target_count",
  "course_lesson_id",
  "test_slug",
].join(",");

export async function getOrCreateStudyPlan(
  email: string,
  profile: StudyPlannerProfile,
  now: Date = new Date(),
): Promise<StudyPlan> {
  if (profile.activePlanId) {
    const stored = await loadStudyPlan(email, profile.activePlanId);
    if (stored && isReusable(stored.row, profile, now)) {
      return applyEvidence(stored.plan);
    }
  }
  return regenerateStudyPlan(email, profile, now);
}

export async function regenerateStudyPlan(
  email: string,
  profile: StudyPlannerProfile,
  now: Date = new Date(),
): Promise<StudyPlan> {
  const today = todayInNewYork(now);
  // Neither a passed SAT date nor a passed finish-by date leaves work to
  // schedule, so hand back an unsaved empty snapshot instead of a stored plan.
  if (profile.testDate < today || (profile.finishBy !== null && profile.finishBy < today)) {
    return generateStudyPlan({
      email,
      profile,
      mathCatalog: null,
      readingWritingCatalog: null,
      courses: [],
      testAttempts: [],
      now,
      planId: profile.testDate < today ? `expired-${today}` : `finished-${today}`,
    });
  }
  const [mathCatalog, readingWritingCatalog, courses, testAttempts, tests] = await Promise.all([
    getMathBankCatalog(email, { strictActivity: true }),
    getReadingWritingBankCatalog(email, { strictActivity: true }),
    listCoursesForStudentStrict(email),
    listTestSignals(email),
    listTestCatalog(),
  ]);
  const planId = crypto.randomUUID();
  const plan = generateStudyPlan({
    email,
    profile,
    mathCatalog,
    readingWritingCatalog,
    courses,
    testAttempts,
    tests,
    now,
    planId,
  });

  await persistPlan(plan, profile);
  return applyEvidence(plan);
}

export class StudyPlanEditError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudyPlanEditError";
    this.status = status;
  }
}

// Manual rescheduling. The plan itself stays the generated snapshot; only the
// day a task sits on, its order inside that day, and whether it is still in the
// week can change, and the plan records that a student touched it.
export async function editStudyPlan(
  email: string,
  profile: StudyPlannerProfile,
  planId: string,
  edit: StudyPlanEdit,
  now: Date = new Date(),
): Promise<StudyPlan> {
  if (profile.activePlanId !== planId) {
    throw new StudyPlanEditError("This week was rebuilt. Reload the planner and try again.", 409);
  }
  const stored = await loadStudyPlan(email, planId);
  if (!stored) {
    throw new StudyPlanEditError("That study plan could not be found.", 404);
  }
  const plan = stored.plan;
  const target = plan.tasks.find((task) => task.id === edit.taskId);
  if (!target) {
    throw new StudyPlanEditError("That task is no longer in your plan.", 404);
  }
  if (edit.action === "move") {
    if (edit.date < plan.startsOn || edit.date > plan.endsOn) {
      throw new StudyPlanEditError("Pick a day inside this week's plan.", 400);
    }
    if (edit.date === plan.testDate) {
      throw new StudyPlanEditError("Test day stays clear of study tasks.", 400);
    }
    if (edit.date === target.date) return applyEvidence(plan);
  }

  const tasks = rescheduleTasks(plan.tasks, edit);
  if (sameSchedule(plan.tasks, tasks)) return applyEvidence(plan);

  const customizedAt = now.toISOString();
  await persistTaskOrder(
    planId,
    email,
    tasks,
    edit.action === "remove" ? target.id : null,
    customizedAt,
  );
  return applyEvidence({ ...plan, tasks, customizedAt });
}

async function persistTaskOrder(
  planId: string,
  email: string,
  tasks: StudyPlanTask[],
  removedTaskId: string | null,
  customizedAt: string,
): Promise<void> {
  const db = supabaseAdmin();
  if (removedTaskId) {
    const removal = await db
      .from("study_planner_tasks")
      .delete()
      .eq("id", removedTaskId)
      .eq("plan_id", planId);
    if (removal.error) throw databaseError("Could not remove that task", removal.error);
  }

  if (tasks.length > 0) {
    // One statement, so the deferred (plan_id, position) uniqueness only has to
    // hold once every task has been renumbered.
    const reorder = await db.from("study_planner_tasks").upsert(tasks.map((task) => ({
      id: task.id,
      plan_id: planId,
      task_date: task.date,
      position: task.position,
      kind: task.kind,
      section: task.section,
      skill: task.skill,
      title: task.title,
      description: task.description,
      reason: task.reason,
      href: task.href,
      estimated_minutes: task.estimatedMinutes,
      target_count: task.targetCount,
      course_lesson_id: task.courseLessonId,
      test_slug: task.testSlug,
    })), { onConflict: "id" });
    if (reorder.error) throw databaseError("Could not save your schedule change", reorder.error);
  }

  const stamp = await db
    .from("study_planner_plans")
    .update({ customized_at: customizedAt })
    .eq("id", planId)
    .eq("email", email);
  if (stamp.error) throw databaseError("Could not save your schedule change", stamp.error);
}

async function persistPlan(plan: StudyPlan, profile: StudyPlannerProfile): Promise<void> {
  const db = supabaseAdmin();
  const planResult = await db.from("study_planner_plans").insert({
    id: plan.id,
    email: plan.email,
    generated_at: plan.generatedAt,
    starts_on: plan.startsOn,
    ends_on: plan.endsOn,
    test_date: plan.testDate,
    finish_by: plan.finishBy,
    phase: plan.phase,
    goal_score: plan.goalScore,
    current_score: plan.currentScore,
    score_gap: plan.scoreGap,
    days_to_test: plan.daysToTest,
    score_runway: plan.scoreRunway,
    focus_areas: plan.focusAreas,
    total_minutes: plan.totalMinutes,
    study_days: profile.studyDays,
    daily_minutes: profile.dailyMinutes,
    practice_test_day: profile.practiceTestDay,
    compression: plan.compression,
    customized_at: null,
    profile_updated_at: profile.updatedAt,
  });
  if (planResult.error) throw databaseError("Could not save study plan", planResult.error);

  try {
    if (plan.tasks.length > 0) {
      const taskResult = await db.from("study_planner_tasks").insert(plan.tasks.map((task) => ({
        id: task.id,
        plan_id: plan.id,
        task_date: task.date,
        position: task.position,
        kind: task.kind,
        section: task.section,
        skill: task.skill,
        title: task.title,
        description: task.description,
        reason: task.reason,
        href: task.href,
        estimated_minutes: task.estimatedMinutes,
        target_count: task.targetCount,
        course_lesson_id: task.courseLessonId,
        test_slug: task.testSlug,
      })));
      if (taskResult.error) throw databaseError("Could not save study plan tasks", taskResult.error);
    }

    // Compare both settings version and prior pointer so concurrent/stale builds
    // cannot replace a plan generated from newer profile inputs.
    let activation = db
      .from("study_planner_profiles")
      .update({ active_plan_id: plan.id })
      .eq("email", plan.email)
      .eq("updated_at", profile.updatedAt);
    activation = profile.activePlanId
      ? activation.eq("active_plan_id", profile.activePlanId)
      : activation.is("active_plan_id", null);
    const profileResult = await activation.select("email").maybeSingle<{ email: string }>();
    if (profileResult.error) throw databaseError("Could not activate study plan", profileResult.error);
    if (!profileResult.data) throw new Error("Study planner settings changed while the plan was building.");
  } catch (error) {
    const cleanup = await db.from("study_planner_plans").delete().eq("id", plan.id).eq("email", plan.email);
    if (cleanup.error) {
      reportServerError("study_planner.plan_cleanup_failed", cleanup.error, {
        provider: "supabase",
        source: "save-study-plan",
      });
    }
    throw error;
  }
}

async function loadStudyPlan(
  email: string,
  planId: string,
): Promise<{ row: PlanRow; plan: StudyPlan } | null> {
  const db = supabaseAdmin();
  const planResult = await db
    .from("study_planner_plans")
    .select(PLAN_COLUMNS)
    .eq("id", planId)
    .eq("email", email)
    .maybeSingle<PlanRow>();
  if (planResult.error) throw databaseError("Could not load study plan", planResult.error);
  if (!planResult.data) return null;

  const taskResult = await db
    .from("study_planner_tasks")
    .select(TASK_COLUMNS)
    .eq("plan_id", planId)
    .order("position")
    .returns<TaskRow[]>();
  if (taskResult.error) throw databaseError("Could not load study plan tasks", taskResult.error);

  const tasks = (taskResult.data ?? []).map(fromTaskRow);
  const row = planResult.data;
  return {
    row,
    plan: {
      id: row.id,
      email: row.email,
      generatedAt: row.generated_at,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      testDate: row.test_date,
      finishBy: row.finish_by,
      phase: asPhase(row.phase),
      goalScore: row.goal_score,
      currentScore: row.current_score,
      scoreGap: row.score_gap,
      daysToTest: row.days_to_test,
      scoreRunway: row.score_runway,
      focusAreas: row.focus_areas,
      totalMinutes: row.total_minutes,
      compression: storedCompression(row),
      settings: {
        studyDays: [...row.study_days].sort((left, right) => left - right),
        dailyMinutes: row.daily_minutes,
        practiceTestDay: row.practice_test_day,
      },
      customizedAt: row.customized_at,
      tasks,
      progress: progress(0, tasks.length),
    },
  };
}

// Plans written before the finish-by column existed carry an empty compression
// object, so fall back to the settings the plan was actually built from.
function storedCompression(row: PlanRow): StudyPlanCompression {
  const stored = row.compression;
  if (stored && typeof stored.slotsPerDay === "number") return stored;
  return {
    finishBy: row.finish_by,
    requiredItems: 0,
    studyDaysRemaining: 0,
    slotsPerDay: 1,
    dailyMinutes: row.daily_minutes,
    studyDays: [...row.study_days].sort((left, right) => left - right),
    addedStudyDays: [],
    onTrack: true,
  };
}

async function applyEvidence(plan: StudyPlan): Promise<StudyPlan> {
  const questionTasks = plan.tasks.filter(hasQuestionTarget);
  const lessonIds = plan.tasks
    .map((task) => task.courseLessonId)
    .filter((id): id is string => id !== null);
  const hasTestTask = plan.tasks.some((task) => task.kind === "full_test");
  const targetSections = [...new Set(questionTasks.map((task) => task.section))];
  const targetSkills = [...new Set(questionTasks.map((task) => task.skill))];

  const [questionAttempts, lessonCompletions, testAttempts, pinnedQuestions] = await Promise.all([
    loadQuestionEvidence(plan.email, plan.generatedAt, targetSections, targetSkills),
    loadLessonEvidence(plan.email, plan.generatedAt, lessonIds),
    loadTestEvidence(plan.email, plan.generatedAt, hasTestTask),
    loadPinnedQuestionIds(questionTasks.map((task) => task.id)),
  ]);

  const attemptsBySkill = new Map<string, Set<string>>();
  for (const attempt of questionAttempts) {
    if (!isSection(attempt.section) || !attempt.skill) continue;
    const key = skillKey(attempt.section, attempt.skill);
    const questionIds = attemptsBySkill.get(key) ?? new Set<string>();
    questionIds.add(attempt.question_id);
    attemptsBySkill.set(key, questionIds);
  }
  const completedLessons = new Set(lessonCompletions.map((completion) => completion.lesson_id));
  const unusedTestAttempts = [...testAttempts].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );

  const tasks = plan.tasks.map((task): StudyPlanTask => {
    let completedCount = 0;
    // A pinned set can be smaller than the plan asked for, when the task's
    // filters had less than that left in the bank. The student is done when
    // they have finished the set they were actually handed.
    let targetCount = task.targetCount;
    if (hasQuestionTarget(task)) {
      const attempted = attemptsBySkill.get(skillKey(task.section, task.skill)) ?? new Set<string>();
      // Once a task has pinned its questions only those count. The student
      // sees that exact set in the runner, so counting every attempt in the
      // skill would credit this task for work done elsewhere in the bank.
      const pinned = pinnedQuestions.get(task.id);
      completedCount = pinned
        ? pinned.filter((questionId) => attempted.has(questionId)).length
        : attempted.size;
      if (pinned) targetCount = Math.min(task.targetCount, pinned.length);
    } else if (task.kind === "course_lesson" && task.courseLessonId) {
      completedCount = completedLessons.has(task.courseLessonId) ? 1 : 0;
    } else if (task.kind === "full_test") {
      const attemptIndex = unusedTestAttempts.findIndex((attempt) => (
        task.testSlug === null || attempt.testSlug === task.testSlug
      ));
      if (attemptIndex >= 0) {
        completedCount = 1;
        unusedTestAttempts.splice(attemptIndex, 1);
      }
    }
    const taskProgress = progress(completedCount, targetCount);
    return { ...task, targetCount, progress: taskProgress, completed: taskProgress.percent === 100 };
  });
  const completedTasks = tasks.filter((task) => task.completed).length;
  return { ...plan, tasks, progress: progress(completedTasks, tasks.length) };
}

function fromTaskRow(row: TaskRow): StudyPlanTask {
  const targetCount = Math.max(1, row.target_count);
  const kind = asTaskKind(row.kind);
  return {
    id: row.id,
    date: row.task_date,
    position: row.position,
    kind,
    section: isSection(row.section) ? row.section : null,
    skill: row.skill,
    title: row.title,
    description: row.description,
    reason: row.reason,
    href: withPlannerTaskId(row.href, kind, row.id),
    estimatedMinutes: row.estimated_minutes,
    targetCount,
    courseLessonId: row.course_lesson_id,
    testSlug: row.test_slug,
    progress: progress(0, targetCount),
    completed: false,
  };
}

function isReusable(row: PlanRow, profile: StudyPlannerProfile, now: Date): boolean {
  const today = todayInNewYork(now);
  return row.starts_on <= today
    && row.ends_on >= today
    && row.test_date === profile.testDate
    && row.finish_by === profile.finishBy
    && row.goal_score === profile.goalScore
    && row.daily_minutes === profile.dailyMinutes
    && row.practice_test_day === profile.practiceTestDay
    && sameNumbers(row.study_days, profile.studyDays)
    && Date.parse(row.generated_at) >= Date.parse(profile.updatedAt);
}

function hasQuestionTarget(task: StudyPlanTask): task is StudyPlanTask & {
  section: StudyPlanSection;
  skill: string;
} {
  return (task.kind === "question_bank" || task.kind === "review")
    && task.section !== null
    && task.skill !== null;
}

function asPhase(value: string): StudyPlanPhase {
  if (value === "baseline" || value === "foundation" || value === "build" || value === "test_ready" || value === "taper") {
    return value;
  }
  throw new Error(`Unsupported study plan phase: ${value}`);
}

function asTaskKind(value: string): StudyPlanTaskKind {
  if (value === "question_bank" || value === "course_lesson" || value === "full_test" || value === "review") {
    return value;
  }
  throw new Error(`Unsupported study plan task kind: ${value}`);
}

function isSection(value: string | null): value is StudyPlanSection {
  return value === "rw" || value === "math";
}

function sameNumbers(left: number[], right: number[]): boolean {
  const sortedLeft = [...left].sort((first, second) => first - second);
  const sortedRight = [...right].sort((first, second) => first - second);
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((value, index) => value === sortedRight[index]);
}

function progress(completed: number, target: number): StudyPlanProgress {
  const safeCompleted = Math.max(0, Math.min(completed, target));
  return {
    completed: safeCompleted,
    target,
    percent: target === 0 ? 0 : Math.round((safeCompleted / target) * 100),
  };
}

function skillKey(section: StudyPlanSection, skill: string): string {
  return `${section}:${skill}`;
}

function todayInNewYork(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function databaseError(action: string, error: { message: string; code?: string }): Error {
  const code = error.code ? ` [${error.code}]` : "";
  return new Error(`${action}${code}: ${error.message}`);
}

async function loadQuestionEvidence(
  email: string,
  generatedAt: string,
  sections: StudyPlanSection[],
  skills: string[],
): Promise<QuestionAttemptRow[]> {
  if (sections.length === 0 || skills.length === 0) return [];
  const rows: QuestionAttemptRow[] = [];
  let offset = 0;
  while (true) {
    const result = await supabaseAdmin()
      .from("question_bank_attempts")
      .select("question_id,section,skill")
      .eq("email", email)
      .gte("attempted_at", generatedAt)
      .in("section", sections)
      .in("skill", skills)
      .range(offset, offset + 999)
      .returns<QuestionAttemptRow[]>();
    if (result.error) throw databaseError("Could not load study plan question progress", result.error);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
    offset += 1000;
  }
}

async function loadLessonEvidence(
  email: string,
  generatedAt: string,
  lessonIds: string[],
): Promise<LessonCompletionRow[]> {
  if (lessonIds.length === 0) return [];
  const result = await supabaseAdmin()
    .from("course_lesson_completions")
    .select("lesson_id")
    .eq("email", email)
    .gte("completed_at", generatedAt)
    .in("lesson_id", lessonIds)
    .returns<LessonCompletionRow[]>();
  if (result.error) throw databaseError("Could not load study plan lesson progress", result.error);
  return result.data ?? [];
}

async function loadTestEvidence(
  email: string,
  generatedAt: string,
  needed: boolean,
): Promise<CompletedTestAttempt[]> {
  if (!needed) return [];
  const result = await supabaseAdmin()
    .from("test_attempts")
    .select("id,test_slug,created_at,completed_at")
    .eq("email", email)
    .gte("created_at", generatedAt)
    .order("created_at")
    .returns<TestEvidenceRow[]>();
  if (result.error) throw databaseError("Could not load study plan test progress", result.error);
  return (result.data ?? []).map((row) => ({
    id: row.id,
    testSlug: row.test_slug,
    totalScore: null,
    rwScore: null,
    mathScore: null,
    createdAt: row.completed_at ?? row.created_at,
  }));
}

async function listTestSignals(email: string): Promise<CompletedTestAttempt[]> {
  const result = await supabaseAdmin()
    .from("test_attempts")
    .select("id,test_slug,total_score,rw_score,math_score,created_at,completed_at")
    .eq("email", email)
    .order("created_at", { ascending: true })
    .returns<TestSignalRow[]>();
  if (result.error) throw databaseError("Could not load study plan test signals", result.error);
  return (result.data ?? []).map((row) => ({
    id: row.id,
    testSlug: row.test_slug,
    totalScore: row.total_score,
    rwScore: row.rw_score,
    mathScore: row.math_score,
    createdAt: row.completed_at ?? row.created_at,
  }));
}

async function listTestCatalog(): Promise<TestCatalogRow[]> {
  return (await listTests()).map(({ slug, title }) => ({ slug, title }));
}
