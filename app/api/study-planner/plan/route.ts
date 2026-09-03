import { NextResponse, type NextRequest } from "next/server";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { editStudyPlan, regenerateStudyPlan, StudyPlanEditError, type StudyPlanEdit } from "@/lib/study-planner/plan";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";

type EditInput = {
  planId?: unknown;
  taskId?: unknown;
  action?: unknown;
  date?: unknown;
  direction?: unknown;
};

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

function identifier(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 100 ? value : null;
}

function planEdit(input: EditInput): StudyPlanEdit | null {
  const taskId = identifier(input.taskId);
  if (!taskId) return null;
  if (input.action === "remove") return { action: "remove", taskId };
  if (input.action === "move") {
    return typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
      ? { action: "move", taskId, date: input.date }
      : null;
  }
  if (input.action === "reorder") {
    return input.direction === "up" || input.direction === "down"
      ? { action: "reorder", taskId, direction: input.direction }
      : null;
  }
  return null;
}

export async function POST() {
  const auth = await requirePlannerAccess();
  if ("response" in auth) return auth.response;

  try {
    const rate = await consumeRateLimit("study-plan-regenerate", auth.email, { limit: 30, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many plan updates. Try again later.", resetsAt: rate.resetsAt }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Study Planner is temporarily unavailable." }, { status: 503 });
  }

  try {
    const profile = await getStudyPlannerProfile(auth.email);
    if (!profile) {
      return NextResponse.json({ error: "Set up your Study Planner first." }, { status: 409 });
    }
    return NextResponse.json({ plan: await regenerateStudyPlan(auth.email, profile) });
  } catch (error) {
    reportServerError("study_planner.plan_regeneration_failed", error, {
      provider: "supabase",
      route: "/api/study-planner/plan",
      method: "POST",
    });
    return NextResponse.json({ error: "Could not retune your plan." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePlannerAccess();
  if ("response" in auth) return auth.response;

  try {
    const rate = await consumeRateLimit("study-plan-edit", auth.email, { limit: 200, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many schedule changes. Try again later.", resetsAt: rate.resetsAt }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Study Planner is temporarily unavailable." }, { status: 503 });
  }

  let input: EditInput;
  try {
    input = (await readJsonBody(req, 4 * 1024)) as EditInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const planId = identifier(input.planId);
  const edit = planEdit(input);
  if (!planId || !edit) {
    return NextResponse.json({ error: "That schedule change could not be read." }, { status: 400 });
  }

  try {
    const profile = await getStudyPlannerProfile(auth.email);
    if (!profile) {
      return NextResponse.json({ error: "Set up your Study Planner first." }, { status: 409 });
    }
    return NextResponse.json({ plan: await editStudyPlan(auth.email, profile, planId, edit) });
  } catch (error) {
    if (error instanceof StudyPlanEditError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    reportServerError("study_planner.plan_edit_failed", error, {
      provider: "supabase",
      route: "/api/study-planner/plan",
      method: "PATCH",
    });
    return NextResponse.json({ error: "Could not save your schedule change." }, { status: 500 });
  }
}
