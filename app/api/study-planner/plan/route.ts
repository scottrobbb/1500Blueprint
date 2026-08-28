import { NextResponse } from "next/server";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { regenerateStudyPlan } from "@/lib/study-planner/plan";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { reportServerError } from "@/lib/observability/server";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await getStudentAccess(session.email);
  if (!access.active) {
    return NextResponse.json({ error: "This account cannot access Study Planner." }, { status: 403 });
  }
  if (!access.entitlements.studyPlanner) {
    return NextResponse.json(
      { error: "Study Planner is included with Max.", code: "plan_limit" },
      { status: 402 },
    );
  }

  try {
    const rate = await consumeRateLimit("study-plan-regenerate", session.email, { limit: 30, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many plan updates. Try again later.", resetsAt: rate.resetsAt }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Study Planner is temporarily unavailable." }, { status: 503 });
  }

  try {
    const profile = await getStudyPlannerProfile(session.email);
    if (!profile) {
      return NextResponse.json({ error: "Set up your Study Planner first." }, { status: 409 });
    }
    return NextResponse.json({ plan: await regenerateStudyPlan(session.email, profile) });
  } catch (error) {
    reportServerError("study_planner.plan_regeneration_failed", error, {
      provider: "supabase",
      route: "/api/study-planner/plan",
      method: "POST",
    });
    return NextResponse.json({ error: "Could not retune your plan." }, { status: 500 });
  }
}
