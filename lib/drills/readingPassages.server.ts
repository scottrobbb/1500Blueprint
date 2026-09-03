// Server-only store for AI-generated reading passages. The passage text is sent
// to the browser so the student can read it; the core/depth points it will be
// graded against never leave the server, which is why they live in a row here
// instead of round-tripping through the client.
// Uses the service-role client (bypasses RLS); NEVER import into a Client Component.

import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import type { ReadingDifficulty } from "./readingLevels";
import type { ReadingPoint } from "./readingGrading";

export type GeneratedReadingPassage = {
  id: string;
  level: number;
  difficulty: ReadingDifficulty;
  readSeconds: number;
  topic: string;
  body: string[];
  corePoints: ReadingPoint[];
  depthPoints: ReadingPoint[];
};

type PassageRow = {
  id: string;
  level: number;
  difficulty: string;
  read_seconds: number;
  topic: string | null;
  body: unknown;
  core_points: unknown;
  depth_points: unknown;
};

function passageError(action: string, error: { message: string; code?: string }): Error {
  const code = error.code ? ` [${error.code}]` : "";
  return new Error(`${action}${code}: ${error.message}`);
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toPoints(value: unknown): ReadingPoint[] {
  if (!Array.isArray(value)) return [];
  const out: ReadingPoint[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { label, text } = entry as Record<string, unknown>;
    if (typeof label === "string" && typeof text === "string") out.push({ label, text });
  }
  return out;
}

function toPassage(row: PassageRow): GeneratedReadingPassage {
  return {
    id: row.id,
    level: row.level,
    difficulty: row.difficulty as ReadingDifficulty,
    readSeconds: row.read_seconds,
    topic: row.topic ?? "",
    body: toStrings(row.body),
    corePoints: toPoints(row.core_points),
    depthPoints: toPoints(row.depth_points),
  };
}

const PASSAGE_SELECT = "id,level,difficulty,read_seconds,topic,body,core_points,depth_points";

export async function saveGeneratedPassage(
  email: string,
  passage: Omit<GeneratedReadingPassage, "id">,
): Promise<GeneratedReadingPassage> {
  const { data, error } = await supabaseAdmin()
    .from("reading_generated_passages")
    .insert({
      email,
      level: passage.level,
      difficulty: passage.difficulty,
      read_seconds: passage.readSeconds,
      topic: passage.topic,
      body: passage.body,
      core_points: passage.corePoints,
      depth_points: passage.depthPoints,
    })
    .select(PASSAGE_SELECT)
    .single<PassageRow>();
  if (error) throw passageError("Could not save the generated passage", error);
  return toPassage(data);
}

// The subjects this student has read recently, so the generator can steer away
// from repeating them.
export async function recentPassageTopics(email: string, limit = 8): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from("reading_generated_passages")
    .select("topic")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<{ topic: string | null }[]>();
  if (error) throw passageError("Could not load recent passage topics", error);
  return (data ?? []).map((row) => row.topic?.trim() ?? "").filter(Boolean);
}

// Claims a passage for grading. Returns null when the id is unknown, belongs to
// another student, or has already been graded — one recall per passage, so a
// replayed submission can never inflate the streak.
export async function claimPassageForGrading(
  email: string,
  passageId: string,
): Promise<GeneratedReadingPassage | null> {
  const { data, error } = await supabaseAdmin()
    .from("reading_generated_passages")
    .update({ graded_at: new Date().toISOString() })
    .eq("id", passageId)
    .eq("email", email)
    .is("graded_at", null)
    .select(PASSAGE_SELECT)
    .maybeSingle<PassageRow>();
  if (error) throw passageError("Could not claim the passage for grading", error);
  return data ? toPassage(data) : null;
}

// Releases a claim when grading never produced a result, so the student can
// retry the same passage instead of losing the read.
export async function releasePassageClaim(email: string, passageId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("reading_generated_passages")
    .update({ graded_at: null })
    .eq("id", passageId)
    .eq("email", email);
  if (error) throw passageError("Could not release the passage claim", error);
}
