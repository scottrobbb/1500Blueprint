import { NextResponse } from "next/server";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { regenerateStudyPlan } from "@/lib/study-planner/plan";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";

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
    const profile = await getStudyPlannerProfile(session.email);
    if (!profile) {
      return NextResponse.json({ error: "Set up your Study Planner first." }, { status: 409 });
    }
    return NextResponse.json({ plan: await regenerateStudyPlan(session.email, profile) });
  } catch (error) {
    console.error("study planner regeneration failed", error);
    return NextResponse.json({ error: "Could not retune your plan." }, { status: 500 });
  }
}
