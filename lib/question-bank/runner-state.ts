import "server-only";

import type { QuestionBankOutcome, QuestionBankRunnerState } from "@/lib/question-bank/math";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function getQuestionBankRunnerState(
  email: string,
  questionIds: string[],
): Promise<QuestionBankRunnerState> {
  if (questionIds.length === 0) return { outcomes: {}, savedQuestionIds: [] };

  const outcomes: Record<string, QuestionBankOutcome> = {};
  const savedQuestionIds: string[] = [];

  const batches = await Promise.all(
    chunks(questionIds, 100).map((questionIdBatch) => loadStateBatch(email, questionIdBatch)),
  );
  for (const batch of batches) {
    Object.assign(outcomes, batch.outcomes);
    savedQuestionIds.push(...batch.savedQuestionIds);
  }

  return { outcomes, savedQuestionIds };
}

async function loadStateBatch(email: string, questionIds: string[]) {
  const [outcomes, saved] = await Promise.all([
    loadOutcomes(email, questionIds),
    supabaseAdmin()
      .from("question_bank_saves")
      .select("question_id")
      .eq("email", email)
      .in("question_id", questionIds)
      .returns<{ question_id: string }[]>(),
  ]);
  if (saved.error) throw databaseError("Could not load saved questions", saved.error);
  return { outcomes, savedQuestionIds: (saved.data ?? []).map((row) => row.question_id) };
}

// Selects the outcome columns only. The response column is deliberately not
// read: it names the choice the student picked, which is what must not survive
// into a re-attempt. Rows arrive newest first, so the first one seen for a
// question is its latest attempt.
async function loadOutcomes(
  email: string,
  questionIds: string[],
): Promise<Record<string, QuestionBankOutcome>> {
  const outcomes: Record<string, QuestionBankOutcome> = {};
  let offset = 0;
  while (true) {
    const result = await supabaseAdmin()
      .from("question_bank_attempts")
      .select("question_id,correct")
      .eq("email", email)
      .in("question_id", questionIds)
      .order("attempted_at", { ascending: false })
      .range(offset, offset + 999)
      .returns<{ question_id: string; correct: boolean }[]>();
    if (result.error) throw databaseError("Could not load Question Bank attempts", result.error);

    const page = result.data ?? [];
    for (const row of page) {
      const existing = outcomes[row.question_id];
      if (!existing) {
        outcomes[row.question_id] = { correct: row.correct, hadIncorrectAttempt: !row.correct };
      } else if (!row.correct) {
        existing.hadIncorrectAttempt = true;
      }
    }
    if (page.length < 1000) break;
    offset += 1000;
  }
  return outcomes;
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
