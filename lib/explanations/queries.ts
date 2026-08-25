import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";

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

export async function listExplanationQueue(limit = 250): Promise<ExplanationQueueItem[]> {
  const { data, error } = await supabaseAdmin()
    .rpc("get_explanation_queue", { p_limit: Math.max(1, Math.min(limit, 500)) });
  if (error) throw new Error(`failed to load explanation queue: ${error.message}`);
  const rows = (data ?? []) as unknown as ExplanationQueueRow[];
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
    p_explanation: explanation.trim(),
  });
  if (error) throw new Error(`failed to update explanation: ${error.message}`);
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
