// Server-only persistence for an in-progress practice test. One row per
// (student, test) holds the serialized runner state plus passage highlights so a
// student can exit mid-test and resume exactly where they left off. Written with
// the service-role client; never import this into a Client Component.

import { supabaseAdmin } from "@/utils/supabase/admin";
import type { TestState } from "./testState";
import type { Highlight } from "@/components/test/HighlightablePassage";

export type SavedSession = {
  state: TestState;
  highlights: Record<string, Highlight[]>;
  savedAt?: string;
  loadedAt?: string;
};

// A late in-flight save must not resurrect a just-finished test's resume row.
// Completion clears the session; if an attempt completed within this window, a
// straggler save is refused so the clear wins deterministically.
const COMPLETED_GUARD_MS = 15_000;

export async function saveTestSession(
  email: string,
  slug: string,
  session: SavedSession,
): Promise<void> {
  const db = supabaseAdmin();
  const savedAt = new Date().toISOString();
  const { data: recent } = await db
    .from("test_attempts")
    .select("completed_at")
    .eq("email", email)
    .eq("test_slug", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ completed_at: string | null }>();
  if (recent?.completed_at && Date.now() - Date.parse(recent.completed_at) < COMPLETED_GUARD_MS) {
    return;
  }
  const { error } = await db
    .from("test_sessions")
    .upsert(
      { email, test_slug: slug, state: { ...session, savedAt }, updated_at: savedAt },
      { onConflict: "email,test_slug" },
    );
  if (error) throw new Error(`saveTestSession failed: ${error.message}`);
}

export async function loadTestSession(
  email: string,
  slug: string,
): Promise<SavedSession | null> {
  const { data } = await supabaseAdmin()
    .from("test_sessions")
    .select("state,updated_at")
    .eq("email", email)
    .eq("test_slug", slug)
    .maybeSingle<{ state: SavedSession; updated_at: string }>();
  return data?.state
    ? {
        ...data.state,
        savedAt: data.state.savedAt ?? data.updated_at,
        loadedAt: new Date().toISOString(),
      }
    : null;
}

export async function listResumableTestSlugs(email: string, slugs: string[]): Promise<Set<string>> {
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) return new Set();
  const { data, error } = await supabaseAdmin()
    .from("test_sessions")
    .select("test_slug")
    .eq("email", email)
    .in("test_slug", uniqueSlugs)
    .returns<{ test_slug: string }[]>();
  if (error) throw new Error(`listResumableTestSlugs failed: ${error.message}`);
  return new Set((data ?? []).map((row) => row.test_slug));
}

export async function clearTestSession(email: string, slug: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("test_sessions")
    .delete()
    .eq("email", email)
    .eq("test_slug", slug);
  if (error) throw new Error(`clearTestSession failed: ${error.message}`);
}
