import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";

type QuestionBankAttemptInput = {
  email: string;
  questionId: string;
  sessionId: string | null;
  clientToken: string;
  response: string;
  correct: boolean;
  durationMs: number;
  section: "rw" | "math";
  domain: string | null;
  skill: string | null;
  difficulty: "easy" | "medium" | "hard";
  limit: number | null;
};

export type QuestionBankAttemptWrite = {
  inserted: boolean;
  duplicate: boolean;
  allowed: boolean;
  used: number;
  questionId: string | null;
  response: string | null;
  correct: boolean | null;
};

type AttemptRpcRow = {
  inserted: boolean;
  duplicate: boolean;
  allowed: boolean;
  used: number | string;
  stored_question_id: string | null;
  stored_response: { value?: unknown } | null;
  stored_correct: boolean | null;
};

export async function recordQuestionBankAttempt(
  input: QuestionBankAttemptInput,
): Promise<QuestionBankAttemptWrite> {
  const result = await supabaseAdmin()
    .rpc("record_question_bank_attempt", {
      p_email: input.email,
      p_question_id: input.questionId,
      p_session_id: input.sessionId,
      p_client_token: input.clientToken,
      p_response: { value: input.response },
      p_correct: input.correct,
      p_duration_ms: input.durationMs,
      p_section: input.section,
      p_domain: input.domain,
      p_skill: input.skill,
      p_difficulty: input.difficulty,
      p_limit: input.limit,
    })
    .single<AttemptRpcRow>();

  if (result.error || !result.data) {
    const code = result.error?.code ? ` [${result.error.code}]` : "";
    throw new Error(`Could not save Question Bank attempt${code}: ${result.error?.message ?? "No result returned"}`);
  }

  const used = typeof result.data.used === "number" ? result.data.used : Number(result.data.used);
  return {
    inserted: result.data.inserted,
    duplicate: result.data.duplicate,
    allowed: result.data.allowed,
    used: Number.isFinite(used) ? used : 0,
    questionId: result.data.stored_question_id,
    response: typeof result.data.stored_response?.value === "string"
      ? result.data.stored_response.value
      : null,
    correct: result.data.stored_correct,
  };
}
