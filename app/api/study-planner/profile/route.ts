import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";
import { supabaseAdmin } from "@/utils/supabase/admin";

type ProfileInput = {
  testDate?: unknown;
  currentScore?: unknown;
  goalScore?: unknown;
  studyDays?: unknown;
  practiceTestDay?: unknown;
  scorePromptAttemptId?: unknown;
};

function score(value: unknown, required: boolean): number | null {
  if (value === null || value === undefined || value === "") return required ? null : null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 400 && parsed <= 1600 ? parsed : null;
}

function date(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(new Date(`${value}T00:00:00`).getTime()) ? null : value;
}

function days(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = [...new Set(value.map(Number))].sort((a, b) => a - b);
  return parsed.length >= 1 && parsed.length <= 7 && parsed.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ? parsed : null;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ profile: await getStudyPlannerProfile(session.email) });
  } catch (error) {
    console.error("study planner profile read failed", error);
    return NextResponse.json({ error: "Could not load your planner" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: ProfileInput;
  try {
    input = (await req.json()) as ProfileInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const testDate = date(input.testDate);
  const currentScore = score(input.currentScore, false);
  const goalScore = score(input.goalScore, true);
  const studyDays = days(input.studyDays);
  const practiceTestDay = Number(input.practiceTestDay);
  if (
    !testDate || !goalScore || !studyDays || !Number.isInteger(practiceTestDay) || practiceTestDay < 0 || practiceTestDay > 6
    || (input.currentScore !== null && input.currentScore !== undefined && input.currentScore !== "" && !currentScore)
  ) {
    return NextResponse.json({ error: "Check your test date, scores, and study days." }, { status: 400 });
  }

  const { error } = await supabaseAdmin().from("study_planner_profiles").upsert({
    email: session.email,
    test_date: testDate,
    current_score: currentScore,
    goal_score: goalScore,
    study_days: studyDays,
    practice_test_day: practiceTestDay,
    updated_at: new Date().toISOString(),
  }, { onConflict: "email" });
  if (error) {
    console.error("study planner profile save failed", error);
    return NextResponse.json({ error: "Could not save your planner" }, { status: 500 });
  }

  return NextResponse.json({ profile: await getStudyPlannerProfile(session.email) });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: ProfileInput;
  try {
    input = (await req.json()) as ProfileInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentScore = score(input.currentScore, false);
  const attemptId = typeof input.scorePromptAttemptId === "string" ? input.scorePromptAttemptId : null;
  if (input.currentScore !== null && input.currentScore !== undefined && !currentScore) {
    return NextResponse.json({ error: "Use an SAT score from 400 to 1600." }, { status: 400 });
  }

  const update: { current_score?: number | null; last_score_prompt_attempt_id?: string } = {};
  if (input.currentScore !== undefined) update.current_score = currentScore;
  if (attemptId) update.last_score_prompt_attempt_id = attemptId;
  if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data: existing, error: existingError } = await supabaseAdmin()
    .from("study_planner_profiles")
    .select("email")
    .eq("email", session.email)
    .maybeSingle<{ email: string }>();
  if (existingError) {
    console.error("study planner profile lookup failed", existingError);
    return NextResponse.json({ error: "Could not update your score" }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Set up your Study Planner first." }, { status: 409 });

  const { error } = await supabaseAdmin().from("study_planner_profiles").update({ ...update, updated_at: new Date().toISOString() }).eq("email", session.email);
  if (error) {
    console.error("study planner profile update failed", error);
    return NextResponse.json({ error: "Could not update your score" }, { status: 500 });
  }
  return NextResponse.json({ profile: await getStudyPlannerProfile(session.email) });
}
