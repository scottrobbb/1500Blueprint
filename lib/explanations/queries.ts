import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin";
import { canonicalizeCourseAssetReferences, signCourseAssetReferences } from "@/lib/courses/assets.server";

export type ExplanationTargetType = "question_bank" | "practice_test";

export type ExplanationQueueItem = {
  id: string;
  targetType: ExplanationTargetType;
  sourceLabel: string;
  location: string;
  section: "rw" | "math";
  difficulty: string;
  skill: string | null;
  passage: string | null;
  prompt: string;
  figureUrl: string | null;
  choices: { id: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  published: boolean;
};

export type ExplanationEditorStats = {
  email: string;
  name: string | null;
  completedTotal: number;
  completedLast7Days: number;
  completedToday: number;
  lastCompletedAt: string | null;
  currentStaff: boolean;
};

type ExplanationQueueRow = {
  id: string;
  target_type: ExplanationTargetType;
  source_label: string;
  location: string;
  section: string;
  difficulty: string;
  skill: string | null;
  passage: string | null;
  prompt: string;
  figure_url: string | null;
  choices: unknown;
  correct_answer: string;
  explanation: string;
  published: boolean;
};

type ExplanationEditorStatsRow = {
  editor_email: string;
  editor_name: string | null;
  completed_total: number | string;
  completed_last_7_days: number | string;
  completed_today: number | string;
  last_completed_at: string | null;
  current_staff: boolean;
};

// The queue itself is capped at 500 rows for the sidebar list; this is the
// true remaining total, independent of that cap, for the "open" badge.
export async function countExplanationQueueRemaining(): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("get_explanation_queue_count");
  if (error) throw new Error(`failed to count explanation queue: ${error.message}`);
  return numberValue(data as number | string);
}

export async function listExplanationQueue(limit = 500): Promise<ExplanationQueueItem[]> {
  const { data, error } = await supabaseAdmin()
    .rpc("get_explanation_queue", { p_limit: Math.max(1, Math.min(limit, 500)) });
  if (error) throw new Error(`failed to load explanation queue: ${error.message}`);
  const rows = await signCourseAssetReferences((data ?? []) as unknown as ExplanationQueueRow[]);
  return rows.map((row) => ({
    id: row.id,
    targetType: row.target_type,
    sourceLabel: row.source_label,
    location: row.location,
    section: row.section === "math" ? "math" : "rw",
    difficulty: row.difficulty,
    skill: row.skill,
    passage: row.passage,
    prompt: row.prompt,
    figureUrl: row.figure_url,
    choices: parseChoices(row.choices),
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
    published: row.published,
  }));
}

export async function listExplanationEditorStats(): Promise<ExplanationEditorStats[]> {
  const { data, error } = await supabaseAdmin().rpc("get_explanation_editor_stats");
  if (error) throw new Error(`failed to load explanation editor stats: ${error.message}`);

  return ((data ?? []) as unknown as ExplanationEditorStatsRow[]).map((row) => ({
    email: row.editor_email,
    name: row.editor_name,
    completedTotal: numberValue(row.completed_total),
    completedLast7Days: numberValue(row.completed_last_7_days),
    completedToday: numberValue(row.completed_today),
    lastCompletedAt: row.last_completed_at,
    currentStaff: row.current_staff || isAdminEmail(row.editor_email),
  }));
}

export async function updateExplanation(
  editorEmail: string,
  targetType: ExplanationTargetType,
  targetId: string,
  explanation: string,
): Promise<void> {
  const { error } = await supabaseAdmin().rpc("update_staff_explanation", {
    p_editor_email: editorEmail.trim().toLowerCase(),
    p_target_type: targetType,
    p_target_id: targetId,
    p_explanation: canonicalizeCourseAssetReferences(explanation.trim()),
  });
  if (error) throw new Error(`failed to update explanation: ${error.message}`);
}

export type QuestionContentEdit = {
  prompt?: string;
  passage?: string;
  choices?: { id: string; text: string }[];
};

// Narrower than the admin question editor: only wording (prompt/passage/
// choice text) can change here, never the correct answer, difficulty,
// skill, status, or choice ids/count/order. Enforced again in the RPC.
export async function updateQuestionContent(
  editorEmail: string,
  targetType: ExplanationTargetType,
  targetId: string,
  edit: QuestionContentEdit,
): Promise<void> {
  const { error } = await supabaseAdmin().rpc("update_staff_question_content", {
    p_editor_email: editorEmail.trim().toLowerCase(),
    p_target_type: targetType,
    p_target_id: targetId,
    p_prompt: edit.prompt === undefined ? null : canonicalizeCourseAssetReferences(edit.prompt),
    p_passage: edit.passage === undefined ? null : canonicalizeCourseAssetReferences(edit.passage),
    p_choices: edit.choices === undefined ? null : canonicalizeCourseAssetReferences(edit.choices),
  });
  if (error) throw new Error(`failed to update question content: ${error.message}`);
}

function parseChoices(value: unknown): { id: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((choice) => {
    if (!isRecord(choice) || typeof choice.id !== "string" || typeof choice.text !== "string" || !choice.text.trim()) return [];
    return [{ id: choice.id, text: choice.text }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberValue(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
