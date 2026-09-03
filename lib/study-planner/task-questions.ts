import "server-only";

import type { QuestionBankSessionPin } from "@/lib/question-bank/math";
import { supabaseAdmin } from "@/utils/supabase/admin";
import type { StudyPlanSection } from "./generator";

type TaskRow = {
  id: string;
  plan_id: string;
  kind: string;
  section: string | null;
  skill: string | null;
  target_count: number;
};

type PinnedRow = {
  task_id: string;
  position: number;
  question_id: string;
};

export type PlannerTaskSession = {
  taskId: string;
  pin: QuestionBankSessionPin;
};

// Resolves the question set a planner task should open with. A task that has
// been opened before replays exactly what it pinned; one that has not is
// seeded with the questions the student has already answered for it, so a task
// part-finished before this shipped -- or worked from the Question Bank
// directly -- resumes instead of starting over.
//
// Every unknown, foreign, or mismatched task id resolves to null and the
// caller falls back to an ordinary filtered session: a stale link out of an
// old plan must not break practice.
export async function resolvePlannerTaskSession(
  email: string,
  taskId: string | undefined,
  section: StudyPlanSection,
): Promise<PlannerTaskSession | null> {
  if (!taskId) return null;
  const db = supabaseAdmin();

  const taskResult = await db
    .from("study_planner_tasks")
    .select("id,plan_id,kind,section,skill,target_count")
    .eq("id", taskId)
    .maybeSingle<TaskRow>();
  if (taskResult.error) throw databaseError("Could not load the study plan task", taskResult.error);
  const task = taskResult.data;
  if (!task || task.section !== section || !task.skill) return null;
  if (task.kind !== "question_bank" && task.kind !== "review") return null;

  // The task id arrives in a URL, so ownership is checked against the plan it
  // belongs to rather than assumed.
  const planResult = await db
    .from("study_planner_plans")
    .select("generated_at")
    .eq("id", task.plan_id)
    .eq("email", email)
    .maybeSingle<{ generated_at: string }>();
  if (planResult.error) throw databaseError("Could not load the study plan", planResult.error);
  if (!planResult.data) return null;

  const pinned = await loadPinnedQuestionIds([task.id]);
  const questionIds = pinned.get(task.id) ?? [];
  if (questionIds.length > 0) return { taskId: task.id, pin: { mode: "replay", questionIds } };

  return {
    taskId: task.id,
    pin: {
      mode: "resume",
      questionIds: await loadAnsweredQuestionIds(
        email,
        planResult.data.generated_at,
        section,
        task.skill,
        Math.max(1, task.target_count),
      ),
    },
  };
}

// Pins the set the task just handed out. Two tabs opening the same task at once
// both insert; the first one wins the primary key and the loser reads the
// winning set back, so both sittings agree on the questions from the start.
export async function pinPlannerTaskQuestions(
  taskId: string,
  questionIds: readonly string[],
): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const result = await supabaseAdmin()
    .from("study_planner_task_questions")
    .upsert(
      questionIds.map((questionId, index) => ({
        task_id: taskId,
        position: index + 1,
        question_id: questionId,
      })),
      { onConflict: "task_id,position", ignoreDuplicates: true },
    );
  if (result.error) {
    // A tab that lost the race can also collide on (task_id, question_id) --
    // the same question at a different position -- which the conflict target
    // above does not cover. A set that is already stored is the answer to
    // that; anything else is a real fault.
    const stored = (await loadPinnedQuestionIds([taskId])).get(taskId) ?? [];
    if (stored.length > 0) return stored;
    throw databaseError("Could not pin the study plan question set", result.error);
  }

  return (await loadPinnedQuestionIds([taskId])).get(taskId) ?? [...questionIds];
}

export async function loadPinnedQuestionIds(
  taskIds: readonly string[],
): Promise<Map<string, string[]>> {
  const pinned = new Map<string, string[]>();
  if (taskIds.length === 0) return pinned;

  for (const batch of chunks(taskIds, 100)) {
    const result = await supabaseAdmin()
      .from("study_planner_task_questions")
      .select("task_id,position,question_id")
      .in("task_id", batch)
      .order("position")
      .returns<PinnedRow[]>();
    if (result.error) throw databaseError("Could not load pinned study plan questions", result.error);
    for (const row of result.data ?? []) {
      const questionIds = pinned.get(row.task_id) ?? [];
      questionIds.push(row.question_id);
      pinned.set(row.task_id, questionIds);
    }
  }
  return pinned;
}

// The questions already answered for this task, newest plan window only, in
// the order they were first attempted. This is the same evidence the planner
// counts the task's progress from, so seeding a pin with it keeps the counter
// on the card and the session in the runner telling the same story.
async function loadAnsweredQuestionIds(
  email: string,
  generatedAt: string,
  section: StudyPlanSection,
  skill: string,
  limit: number,
): Promise<string[]> {
  const result = await supabaseAdmin()
    .from("question_bank_attempts")
    .select("question_id")
    .eq("email", email)
    .eq("section", section)
    .eq("skill", skill)
    .gte("attempted_at", generatedAt)
    .order("attempted_at")
    .returns<{ question_id: string }[]>();
  if (result.error) throw databaseError("Could not load answered study plan questions", result.error);

  const questionIds: string[] = [];
  const seen = new Set<string>();
  for (const row of result.data ?? []) {
    if (seen.has(row.question_id)) continue;
    seen.add(row.question_id);
    questionIds.push(row.question_id);
    if (questionIds.length === limit) break;
  }
  return questionIds;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function databaseError(action: string, error: { message: string; code?: string }): Error {
  const code = error.code ? ` [${error.code}]` : "";
  return new Error(`${action}${code}: ${error.message}`);
}
