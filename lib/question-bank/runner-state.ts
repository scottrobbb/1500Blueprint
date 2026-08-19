import "server-only";

import type { QuestionBankRunnerState } from "@/lib/question-bank/math";
import { supabaseAdmin } from "@/utils/supabase/admin";

type AttemptRow = {
  question_id: string;
  correct: boolean;
  response: Record<string, unknown> | null;
  attempted_at: string;
};

export async function getQuestionBankRunnerState(
  email: string,
  questionIds: string[],
): Promise<QuestionBankRunnerState> {
  if (questionIds.length === 0) return { attempts: {}, savedQuestionIds: [] };

  const attempts: QuestionBankRunnerState["attempts"] = {};
  const savedQuestionIds: string[] = [];

  const batches = await Promise.all(
    chunks(questionIds, 100).map((questionIdBatch) => loadStateBatch(email, questionIdBatch)),
  );
  for (const batch of batches) {
    Object.assign(attempts, batch.attempts);
    savedQuestionIds.push(...batch.savedQuestionIds);
  }

  return { attempts, savedQuestionIds };
}

async function loadStateBatch(email: string, questionIds: string[]) {
  const [attempts, saved] = await Promise.all([
    loadAttemptStates(email, questionIds),
    supabaseAdmin()
      .from("question_bank_saves")
      .select("question_id")
      .eq("email", email)
      .in("question_id", questionIds)
      .returns<{ question_id: string }[]>(),
  ]);
  if (saved.error) throw databaseError("Could not load saved questions", saved.error);
  return {
    attempts,
    savedQuestionIds: (saved.data ?? []).map((row) => row.question_id),
  };
}

async function loadAttemptStates(
  email: string,
  questionIds: string[],
): Promise<QuestionBankRunnerState["attempts"]> {
  const states: QuestionBankRunnerState["attempts"] = {};
  let offset = 0;
  while (true) {
    const result = await supabaseAdmin()
      .from("question_bank_attempts")
      .select("question_id,correct,response,attempted_at")
      .eq("email", email)
      .in("question_id", questionIds)
      .order("attempted_at", { ascending: false })
      .range(offset, offset + 999)
      .returns<AttemptRow[]>();
    if (result.error) throw databaseError("Could not load Question Bank attempts", result.error);

    const page = result.data ?? [];
    for (const row of page) {
      const state = states[row.question_id];
      if (!state) {
        const response = responseValue(row.response);
        states[row.question_id] = {
          correct: row.correct,
          response,
          hadIncorrectAttempt: !row.correct,
          incorrectResponses: !row.correct && response ? [response] : [],
        };
      } else if (!row.correct) {
        state.hadIncorrectAttempt = true;
        const response = responseValue(row.response);
        if (response && !state.incorrectResponses.includes(response)) {
          state.incorrectResponses.push(response);
        }
      }
    }
    if (page.length < 1000) break;
    offset += 1000;
  }
  return states;
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

function responseValue(response: Record<string, unknown> | null): string {
  return typeof response?.value === "string" ? response.value : "";
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
