import "server-only";

import type { QuestionBankRunnerState } from "@/lib/question-bank/math";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function getQuestionBankRunnerState(
  email: string,
  questionIds: string[],
): Promise<QuestionBankRunnerState> {
  if (questionIds.length === 0) return { savedQuestionIds: [] };

  const savedQuestionIds: string[] = [];
  const batches = await Promise.all(
    chunks(questionIds, 100).map((questionIdBatch) => loadSavedBatch(email, questionIdBatch)),
  );
  for (const batch of batches) savedQuestionIds.push(...batch);

  return { savedQuestionIds };
}

async function loadSavedBatch(email: string, questionIds: string[]): Promise<string[]> {
  const saved = await supabaseAdmin()
    .from("question_bank_saves")
    .select("question_id")
    .eq("email", email)
    .in("question_id", questionIds)
    .returns<{ question_id: string }[]>();
  if (saved.error) throw databaseError("Could not load saved questions", saved.error);
  return (saved.data ?? []).map((row) => row.question_id);
}

export async function setQuestionBankSaved(
  email: string,
  questionId: string,
  saved: boolean,
): Promise<boolean> {
  const db = supabaseAdmin();
  const catalog = await db
    .from("question_bank_catalog")
    .select("question_id")
    .eq("question_id", questionId)
    .eq("enabled", true)
    .maybeSingle<{ question_id: string }>();
  if (catalog.error || !catalog.data) return false;

  const result = saved
    ? await db.from("question_bank_saves").upsert(
      { email, question_id: questionId, saved_at: new Date().toISOString() },
      { onConflict: "email,question_id" },
    )
    : await db.from("question_bank_saves").delete().eq("email", email).eq("question_id", questionId);

  return !result.error;
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
