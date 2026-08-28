// Server-only persistence for single-module practice attempts. Uses the
// service-role admin client; callers authorize first. Never import into a
// Client Component.

import { supabaseAdmin } from "@/utils/supabase/admin";
import { isMissingModuleSnapshotColumnError } from "@/lib/progress/database";
import { parseModuleAttemptSnapshot, type ModuleAttemptSnapshot } from "./testSnapshot";
import type { AnswerMap } from "./types";

export type ModuleAttemptInput = {
  testSlug: string;
  moduleKey: string;
  label: string;
  correct: number;
  total: number;
  answers: AnswerMap;
  perQuestionTime: Record<string, number>;
  moduleSnapshot?: ModuleAttemptSnapshot;
  clientToken?: string;
};

export type ModuleAttemptSummary = {
  id: string;
  moduleKey: string;
  label: string;
  correct: number;
  total: number;
  createdAt: string;
};

export type StoredModuleAttempt = {
  id: string;
  testSlug: string;
  moduleKey: string;
  label: string;
  correct: number;
  total: number;
  answers: AnswerMap;
  perQuestionTime: Record<string, number>;
  moduleSnapshot: ModuleAttemptSnapshot | null;
  createdAt: string;
};

export type ModuleBest = { correct: number; total: number; count: number };

export async function saveModuleAttempt(
  email: string,
  input: ModuleAttemptInput,
): Promise<string> {
  const db = supabaseAdmin();

  const attemptRow = {
    email,
    test_slug: input.testSlug,
    module_key: input.moduleKey,
    label: input.label,
    correct: input.correct,
    total: input.total,
    answers: input.answers,
    per_question_time: input.perQuestionTime,
    client_token: input.clientToken ?? null,
  };
  let insertion = await db
    .from("module_attempts")
    .insert({
      ...attemptRow,
      module_snapshot: input.moduleSnapshot ?? null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (isMissingModuleSnapshotColumnError(insertion.error)) {
    insertion = await db
      .from("module_attempts")
      .insert(attemptRow)
      .select("id")
      .maybeSingle<{ id: string }>();
  }
  const { data, error } = insertion;

  // A unique-token collision means it was already recorded: return that row.
  if (error || !data) {
    if (input.clientToken) {
      const { data: existing } = await db
        .from("module_attempts")
        .select("id")
        .eq("email", email)
        .eq("client_token", input.clientToken)
        .maybeSingle<{ id: string }>();
      if (existing) return existing.id;
    }
    if (error) throw error;
  }
  return data?.id ?? "";
}

export async function listModuleAttempts(
  email: string,
  slug: string,
): Promise<ModuleAttemptSummary[]> {
  const { data, error } = await supabaseAdmin()
    .from("module_attempts")
    .select("id,module_key,label,correct,total,created_at")
    .eq("email", email)
    .eq("test_slug", slug)
    .order("created_at", { ascending: false })
    .returns<
      { id: string; module_key: string; label: string; correct: number; total: number; created_at: string }[]
    >();
  if (error) throw new Error(`Could not load module attempts [${error.code}]: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    moduleKey: r.module_key,
    label: r.label,
    correct: r.correct,
    total: r.total,
    createdAt: r.created_at,
  }));
}

export async function getModuleAttempt(
  email: string,
  attemptId: string,
): Promise<StoredModuleAttempt | null> {
  type ModuleAttemptRow = {
    id: string;
    test_slug: string;
    module_key: string;
    label: string;
    correct: number;
    total: number;
    answers: AnswerMap | null;
    per_question_time: Record<string, number> | null;
    module_snapshot: unknown;
    created_at: string;
  };
  const db = supabaseAdmin();
  const current = await db
    .from("module_attempts")
    .select("id,test_slug,module_key,label,correct,total,answers,per_question_time,module_snapshot,created_at")
    .eq("email", email)
    .eq("id", attemptId)
    .maybeSingle<ModuleAttemptRow>();
  let data = current.data;
  if (current.error) {
    if (!isMissingModuleSnapshotColumnError(current.error)) {
      throw new Error(`Could not load module attempt [${current.error.code}]: ${current.error.message}`);
    }
    const legacy = await db
      .from("module_attempts")
      .select("id,test_slug,module_key,label,correct,total,answers,per_question_time,created_at")
      .eq("email", email)
      .eq("id", attemptId)
      .maybeSingle<Omit<ModuleAttemptRow, "module_snapshot">>();
    if (legacy.error) throw new Error(`Could not load module attempt [${legacy.error.code}]: ${legacy.error.message}`);
    data = legacy.data ? { ...legacy.data, module_snapshot: null } : null;
  }
  if (!data) return null;
  return {
    id: data.id,
    testSlug: data.test_slug,
    moduleKey: data.module_key,
    label: data.label,
    correct: data.correct,
    total: data.total,
    answers: data.answers ?? {},
    perQuestionTime: data.per_question_time ?? {},
    moduleSnapshot: parseModuleAttemptSnapshot(data.module_snapshot),
    createdAt: data.created_at,
  };
}

// Best attempt (by accuracy) per module key for a test — powers the picker badges.
export async function bestByModuleKey(
  email: string,
  slug: string,
): Promise<Record<string, ModuleBest>> {
  const { data, error } = await supabaseAdmin()
    .from("module_attempts")
    .select("module_key,correct,total")
    .eq("email", email)
    .eq("test_slug", slug)
    .returns<{ module_key: string; correct: number; total: number }[]>();
  if (error) throw new Error(`Could not load module bests [${error.code}]: ${error.message}`);

  const out: Record<string, ModuleBest> = {};
  for (const r of data ?? []) {
    const cur = out[r.module_key];
    if (!cur) {
      out[r.module_key] = { correct: r.correct, total: r.total, count: 1 };
      continue;
    }
    cur.count += 1;
    if (r.correct / Math.max(1, r.total) > cur.correct / Math.max(1, cur.total)) {
      cur.correct = r.correct;
      cur.total = r.total;
    }
  }
  return out;
}
