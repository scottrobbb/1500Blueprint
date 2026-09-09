import "server-only";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { isAdminEmail } from "@/lib/auth/admin";
import {
  getReadingWritingRunnerQuestions,
  getReadingWritingQuestionForGrading,
} from "@/lib/question-bank/reading-writing-queries";
import {
  canonicalizeCourseAssetReferences,
  signCourseAssetReferences,
} from "@/lib/courses/assets.server";
import { achievementRules, drillXpFor } from "@/lib/gamification/engine";
import { readingTopic } from "./method";
import { initialReadingState } from "./state";
import {
  gradeReading,
  publicReadingQuestion,
  validateReadingState,
} from "./validation";
import {
  ROUND_SIZE,
  type ReadingHistory,
  type ReadingKey,
  type ReadingMode,
  type ReadingSession,
  type ReadingState,
} from "./types";

type SessionRow = {
  id: string;
  email: string;
  mode: ReadingMode;
  status: "active" | "completed";
  created_at: string;
  completed_at: string | null;
  revision: number;
  questions: ReadingKey[];
  state: ReadingState;
  results: ReadingSession["results"];
};

export class ReadingSessionError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export async function loadReadingRow(
  email: string,
  id: string,
): Promise<SessionRow> {
  const { data, error } = await supabaseAdmin()
    .from("dense_reading_sessions")
    .select("*")
    .eq("email", email)
    .eq("id", id)
    .maybeSingle<SessionRow>();
  if (error)
    throw new ReadingSessionError(
      "Dense Reading could not be loaded. Please try again.",
    );
  if (!data)
    throw new ReadingSessionError("This reading session was not found.", 404);
  return data;
}

export async function readingSession(row: SessionRow): Promise<ReadingSession> {
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    revision: row.revision,
    questions: await signCourseAssetReferences(
      row.questions.map(publicReadingQuestion),
      true,
    ),
    state: row.state,
    results:
      row.status === "completed"
        ? await signCourseAssetReferences(row.results, true)
        : null,
  };
}

export async function listReadingHistory(
  email: string,
): Promise<ReadingHistory[]> {
  const { data, error } = await supabaseAdmin()
    .from("dense_reading_sessions")
    .select(
      "id,mode,status,created_at,completed_at,correct_count,question_count,elapsed_ms",
    )
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error)
    throw new ReadingSessionError(
      "Dense Reading history is unavailable. Please try again.",
    );
  return (data ?? []).map((row) => ({
    id: row.id,
    mode: row.mode,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    correct: row.correct_count ?? 0,
    total: row.question_count,
    elapsedMs: row.elapsed_ms,
  }));
}

export async function createReadingSession(
  email: string,
  mode: ReadingMode,
  id: string,
  repeatId?: string,
): Promise<string> {
  const db = supabaseAdmin();
  const { data: active, error: activeError } = await db
    .from("dense_reading_sessions")
    .select("id")
    .eq("email", email)
    .eq("status", "active")
    .maybeSingle<{ id: string }>();
  if (activeError)
    throw new ReadingSessionError(
      "Dense Reading is unavailable. Please try again.",
    );
  if (active) return active.id;
  const { data: retry } = await db
    .from("dense_reading_sessions")
    .select("id")
    .eq("id", id)
    .eq("email", email)
    .maybeSingle<{ id: string }>();
  if (retry) return retry.id;
  let questions: ReadingKey[];
  if (repeatId) {
    questions = (await loadReadingRow(email, repeatId)).questions;
  } else {
    const access = await getStudentAccess(email);
    const pool = await getReadingWritingRunnerQuestions(
      email,
      {
        skills: [
          "Cross-Text Connections",
          "Central Ideas and Details",
          "Inferences",
          "Text Structure and Purpose",
          "Command of Evidence",
        ],
        difficulty: [],
        completion: "all",
        savedOnly: false,
      },
      null,
      {
        includeChallenge:
          access.entitlements.challengeQuestions || isAdminEmail(email),
      },
    );
    const eligible = pool.flatMap((q) => {
      const topic = readingTopic(q.prompt, q.skill, q.figureUrl);
      return topic && q.passage?.trim() ? [{ ...q, topic }] : [];
    });
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    // Take one of each available topic before filling the remaining places.
    const topics = new Set<string>();
    const mixed = eligible.filter((q) => {
      if (topics.has(q.topic)) return false;
      topics.add(q.topic);
      return true;
    });
    const selectedIds = new Set(mixed.map((q) => q.id));
    const selected = [
      ...mixed,
      ...eligible.filter((q) => !selectedIds.has(q.id)),
    ].slice(0, ROUND_SIZE);
    if (selected.length < ROUND_SIZE)
      throw new ReadingSessionError(
        "At least 11 published reading questions are needed to start this drill.",
        409,
      );
    const keyed = await Promise.all(
      selected.map(async (q) => {
        const key = await getReadingWritingQuestionForGrading(q.id);
        if (!key || !key.question.passage)
          throw new ReadingSessionError(
            "The reading set changed. Please start again.",
            409,
          );
        return {
          id: q.id,
          topic: q.topic,
          difficulty: key.question.difficulty,
          passage: key.question.passage,
          prompt: key.question.prompt,
          figureUrl: key.question.figureUrl,
          choices: key.question.choices,
          correct: key.correctChoice,
          explanation: key.explanation,
        };
      }),
    );
    questions = keyed;
  }
  const { error } = await db.from("dense_reading_sessions").insert({
    id,
    email,
    mode,
    questions: canonicalizeCourseAssetReferences(questions),
    question_count: questions.length,
    state: initialReadingState(questions.length, mode),
  });
  if (error?.code === "23505") {
    const { data } = await db
      .from("dense_reading_sessions")
      .select("id")
      .eq("email", email)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();
    if (data) return data.id;
  }
  if (error)
    throw new ReadingSessionError("Your reading round could not be created.");
  return id;
}

export async function saveReadingSession(
  email: string,
  id: string,
  revision: number,
  value: unknown,
  complete: boolean,
): Promise<ReadingSession> {
  const row = await loadReadingRow(email, id);
  if (row.status === "completed") return readingSession(row);
  if (row.revision !== revision)
    throw new ReadingSessionError(
      "This round changed in another tab. Reload to continue from the latest save.",
      409,
    );
  let state: ReadingState;
  try {
    state = validateReadingState(value, row.questions, row.mode, row.state);
  } catch (error) {
    throw new ReadingSessionError(
      error instanceof Error ? error.message : "Invalid session",
      400,
    );
  }
  if (complete) {
    const results = gradeReading(row.questions, state);
    const correct = results.filter((r) => r.correct).length;
    const access = await getStudentAccess(email);
    const { error } = await supabaseAdmin().rpc(
      "complete_dense_reading_session",
      {
        p_email: email,
        p_id: id,
        p_revision: revision,
        p_state: state,
        p_results: results,
        p_correct: correct,
        p_xp: drillXpFor(
          "dense-reading",
          Math.round((correct / results.length) * 100),
        ),
        p_rules: achievementRules(),
        p_limit: isAdminEmail(email)
          ? null
          : access.entitlements.dailyDrillLimit === "unlimited"
            ? 500
            : (access.entitlements.dailyDrillLimit ?? 0),
        p_monthly: access.entitlements.dailyDrillLimit === "unlimited",
      },
    );
    if (error) {
      if (/limit reached/i.test(error.message))
        throw new ReadingSessionError(
          "Your drill allowance is used up. Your round is saved so you can finish later.",
          402,
        );
      if (/revision/i.test(error.message))
        throw new ReadingSessionError(
          "This round changed in another tab. Reload to continue.",
          409,
        );
      throw new ReadingSessionError(
        "Your completed round could not be saved. Please retry.",
      );
    }
  } else {
    const { data, error } = await supabaseAdmin()
      .from("dense_reading_sessions")
      .update({
        state,
        revision: revision + 1,
        elapsed_ms: state.elapsedMs,
        updated_at: new Date().toISOString(),
      })
      .eq("email", email)
      .eq("id", id)
      .eq("revision", revision)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error)
      throw new ReadingSessionError(
        "Your progress could not be saved. Please retry.",
      );
    if (!data)
      throw new ReadingSessionError(
        "This round changed in another tab. Reload to continue.",
        409,
      );
  }
  return readingSession(await loadReadingRow(email, id));
}
