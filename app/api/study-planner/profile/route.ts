import { NextResponse, type NextRequest } from "next/server";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { regenerateStudyPlan } from "@/lib/study-planner/plan";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";

type ProfileInput = {
  testDate?: unknown;
  finishBy?: unknown;
  currentScore?: unknown;
  goalScore?: unknown;
  studyDays?: unknown;
  practiceTestDay?: unknown;
  dailyMinutes?: unknown;
  scorePromptAttemptId?: unknown;
};

function score(value: unknown, required: boolean): number | null {
  if (value === null || value === undefined || value === "") return required ? null : null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 400 && parsed <= 1600 && parsed % 10 === 0 ? parsed : null;
}

function date(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
    || value < todayInNewYork()
  ) return null;
  return value;
}

function days(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = [...new Set(value.map(Number))].sort((a, b) => a - b);
  return parsed.length >= 1 && parsed.length <= 7 && parsed.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ? parsed : null;
}

function minutes(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 20 && parsed <= 180 && parsed % 5 === 0 ? parsed : null;
}

function todayInNewYork(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function requirePlannerAccess(): Promise<{ email: string } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const access = await getStudentAccess(session.email);
  if (!access.active) {
    return { response: NextResponse.json({ error: "This account cannot access Study Planner." }, { status: 403 }) };
  }
  if (!access.entitlements.studyPlanner) {
    return {
      response: NextResponse.json(
        { error: "Study Planner is included with Max.", code: "plan_limit" },
        { status: 402 },
      ),
    };
  }
  return { email: session.email };
}

export async function GET() {
  const auth = await requirePlannerAccess();
  if ("response" in auth) return auth.response;

  try {
    return NextResponse.json({ profile: await getStudyPlannerProfile(auth.email) });
  } catch (error) {
    reportServerError("study_planner.profile.read_failed", error, {
      provider: "supabase",
      route: "/api/study-planner/profile",
      method: "GET",
    });
    return NextResponse.json({ error: "Could not load your planner" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requirePlannerAccess();
  if ("response" in auth) return auth.response;

  try {
    const rate = await consumeRateLimit("study-plan-profile", auth.email, { limit: 30, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many plan updates. Try again later.", resetsAt: rate.resetsAt }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Study Planner is temporarily unavailable." }, { status: 503 });
  }

  let input: ProfileInput;
  try {
    input = (await readJsonBody(req, 16 * 1024)) as ProfileInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const testDate = date(input.testDate);
  const finishByProvided = input.finishBy !== null && input.finishBy !== undefined && input.finishBy !== "";
  const finishBy = finishByProvided ? date(input.finishBy) : null;
  const currentScore = score(input.currentScore, false);
  const goalScore = score(input.goalScore, true);
  const studyDays = days(input.studyDays);
  const practiceTestDay = Number(input.practiceTestDay);
  const dailyMinutes = minutes(input.dailyMinutes);
  if (
    !testDate || !goalScore || !studyDays || !dailyMinutes
    || !Number.isInteger(practiceTestDay) || practiceTestDay < 0 || practiceTestDay > 6
    || (input.currentScore !== null && input.currentScore !== undefined && input.currentScore !== "" && !currentScore)
  ) {
    return NextResponse.json({ error: "Check your test date, scores, study time, and available days." }, { status: 400 });
  }
  if (finishByProvided && (!finishBy || finishBy > testDate)) {
    return NextResponse.json({ error: "Pick a finish date between today and your SAT date." }, { status: 400 });
  }

  let existingProfile: Awaited<ReturnType<typeof getStudyPlannerProfile>>;
  try {
    existingProfile = await getStudyPlannerProfile(auth.email);
  } catch (error) {
    reportServerError("study_planner.profile.lookup_failed", error, {
      provider: "supabase",
      route: "/api/study-planner/profile",
      method: "PUT",
    });
    return NextResponse.json({ error: "Could not save your planner" }, { status: 500 });
  }
  const updatedAt = new Date().toISOString();
  const scoreUpdatedAt = existingProfile?.currentScore === currentScore && existingProfile.scoreUpdatedAt
    ? existingProfile.scoreUpdatedAt
    : currentScore === null ? null : updatedAt;

  const { error } = await supabaseAdmin().from("study_planner_profiles").upsert({
    email: auth.email,
    test_date: testDate,
    finish_by: finishBy,
    current_score: currentScore,
    score_updated_at: scoreUpdatedAt,
    goal_score: goalScore,
    study_days: studyDays,
    practice_test_day: practiceTestDay,
    daily_minutes: dailyMinutes,
    updated_at: updatedAt,
  }, { onConflict: "email" });
  if (error) {
    reportServerError("study_planner.profile.save_failed", error, {
      provider: "supabase",
      route: "/api/study-planner/profile",
      method: "PUT",
    });
    return NextResponse.json({ error: "Could not save your planner" }, { status: 500 });
  }

  try {
    const profile = await getStudyPlannerProfile(auth.email);
    if (!profile) throw new Error("Saved planner profile could not be loaded.");
    const plan = await regenerateStudyPlan(auth.email, profile);
    return NextResponse.json({ profile, plan });
  } catch (error) {
    reportServerError("study_planner.plan_generation_failed", error, {
      provider: "supabase",
      route: "/api/study-planner/profile",
      method: "PUT",
    });
    return NextResponse.json({ error: "Your settings were saved, but the plan could not be built." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePlannerAccess();
  if ("response" in auth) return auth.response;

  let input: ProfileInput;
  try {
    input = (await readJsonBody(req, 16 * 1024)) as ProfileInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentScore = score(input.currentScore, false);
  const attemptId = typeof input.scorePromptAttemptId === "string" && input.scorePromptAttemptId.length <= 100
    ? input.scorePromptAttemptId
    : null;
  if (input.currentScore !== null && input.currentScore !== undefined && !currentScore) {
    return NextResponse.json({ error: "Use an SAT score from 400 to 1600." }, { status: 400 });
  }

  const update: { current_score?: number | null; score_updated_at?: string | null; last_score_prompt_attempt_id?: string } = {};
  if (input.currentScore !== undefined) {
    update.current_score = currentScore;
    update.score_updated_at = currentScore === null ? null : new Date().toISOString();
  }
  if (attemptId) {
    const { data: ownedAttempt, error: attemptError } = await supabaseAdmin()
      .from("test_attempts")
      .select("id")
      .eq("id", attemptId)
      .eq("email", auth.email)
      .maybeSingle<{ id: string }>();
    if (attemptError) return NextResponse.json({ error: "Could not verify that test attempt." }, { status: 500 });
    if (!ownedAttempt) return NextResponse.json({ error: "That test attempt was not found." }, { status: 400 });
    update.last_score_prompt_attempt_id = attemptId;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data: existing, error: existingError } = await supabaseAdmin()
    .from("study_planner_profiles")
    .select("email")
    .eq("email", auth.email)
    .maybeSingle<{ email: string }>();
  if (existingError) {
    reportServerError("study_planner.profile.lookup_failed", existingError, {
      provider: "supabase",
      route: "/api/study-planner/profile",
      method: "PATCH",
    });
    return NextResponse.json({ error: "Could not update your score" }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Set up your Study Planner first." }, { status: 409 });

  const settingsChanged = input.currentScore !== undefined;
  const { error } = await supabaseAdmin()
    .from("study_planner_profiles")
    .update(settingsChanged ? { ...update, updated_at: new Date().toISOString() } : update)
    .eq("email", auth.email);
  if (error) {
    reportServerError("study_planner.profile.update_failed", error, {
      provider: "supabase",
      route: "/api/study-planner/profile",
      method: "PATCH",
    });
    return NextResponse.json({ error: "Could not update your score" }, { status: 500 });
  }
  return NextResponse.json({ profile: await getStudyPlannerProfile(auth.email) });
}
