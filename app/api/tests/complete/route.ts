// Completed practice-test persistence. The runner POSTs here when it enters the
// results phase; we recompute the score SERVER-SIDE from the answer map + routed
// variants (scoreTest is pure, so the client can't inflate it), store the full
// attempt, award XP exactly once, and clear any in-progress session so the
// finished test never offers resume.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { loadTest } from "@/lib/sat/loadTest";
import { scoreTest } from "@/lib/sat/scoring";
import { awardTest, getNavStats } from "@/lib/gamification/state";
import { clearTestSession } from "@/lib/sat/testSession";
import { supabaseAdmin } from "@/utils/supabase/admin";
import type { AnswerMap, ModuleVariant, SectionId } from "@/lib/sat/types";
import { isAdminEmail } from "@/lib/auth/admin";
import { isPracticeTestUnderConstruction } from "@/lib/flags";
import { canAccessPracticeTest } from "@/lib/auth/access-control";

type CompleteBody = {
  testSlug?: string;
  answers?: AnswerMap;
  routed?: Partial<Record<SectionId, ModuleVariant>>;
  perQuestionTime?: Record<string, number>;
  clientToken?: string;
};

// A second POST for the same finished test within this window (a StrictMode
// double-render, an accidental refresh) returns the already-saved attempt
// instead of awarding XP again.
const DEDUPE_MS = 10_000;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CompleteBody;
  try {
    body = (await req.json()) as CompleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { testSlug } = body;
  if (!testSlug) {
    return NextResponse.json({ error: "testSlug is required" }, { status: 400 });
  }
  if (!(await canAccessPracticeTest(session.email, testSlug))) {
    return NextResponse.json({ error: "This practice test is not included with your plan.", code: "plan_limit" }, { status: 402 });
  }
  if (isPracticeTestUnderConstruction(testSlug) && !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Practice test is under construction" }, { status: 503 });
  }
  const answers = body.answers ?? {};
  const routed = body.routed ?? {};
  const perQuestionTime = body.perQuestionTime ?? {};

  const test = await loadTest(testSlug);
  if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 });

  // Idempotency guard against a rapid double-submit (returns the existing attempt).
  const recent = await supabaseAdmin()
    .from("test_attempts")
    .select("id,created_at")
    .eq("email", session.email)
    .eq("test_slug", testSlug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; created_at: string }>();
  if (recent.data && Date.now() - Date.parse(recent.data.created_at) < DEDUPE_MS) {
    return NextResponse.json({ attemptId: recent.data.id, deduped: true });
  }

  const result = scoreTest(test, routed, answers);
  const rwScore = result.sections.find((s) => s.sectionId === "rw")?.scaled;
  const mathScore = result.sections.find((s) => s.sectionId === "math")?.scaled;

  let attemptId = "";
  let xpAwarded = 0;
  try {
    const award = await awardTest(session.email, {
      testSlug,
      totalScore: result.total,
      rwScore,
      mathScore,
      answers,
      routed,
      perQuestionTime,
      clientToken: body.clientToken,
    });
    attemptId = award.attemptId;
    xpAwarded = award.xpAwarded;
  } catch (e) {
    console.error("test award failed:", e);
    return NextResponse.json({ error: "Could not save your attempt" }, { status: 500 });
  }

  // Best-effort: a finished test should not offer resume.
  try {
    await clearTestSession(session.email, testSlug);
  } catch (e) {
    console.error("clear test session failed:", e);
  }

  let nav: { streak: number; level: number; xp: number } | undefined;
  try {
    const n = await getNavStats(session.email);
    nav = { streak: n.streak, level: n.level, xp: n.xp };
  } catch {
    nav = undefined;
  }

  // The planner migration may be deployed separately from this route, so a
  // missing profile/table must never block a completed test from being saved.
  const { data: plannerProfile } = await supabaseAdmin()
    .from("study_planner_profiles")
    .select("email")
    .eq("email", session.email)
    .maybeSingle<{ email: string }>();

  return NextResponse.json({ attemptId, xpAwarded, total: result.total, hasStudyPlanner: Boolean(plannerProfile), ...(nav ?? {}) });
}
