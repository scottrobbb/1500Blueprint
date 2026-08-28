import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseStudyActivityInput } from "@/lib/home/continuation-policy";
import { recordStudyActivity } from "@/lib/home/continuation";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await checkRateLimit("study-activity-write", session.email, { limit: 600, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Activity saving is temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many activity requests", resetsAt: rate.resetsAt }, { status: 429 });

  const body = await readJsonBody(request, 16 * 1024).catch(() => null);
  const input = parseStudyActivityInput(body);
  if (!input) {
    return NextResponse.json(
      { error: "A valid activity kind and resource ID are required." },
      { status: 400 },
    );
  }

  try {
    const result = await recordStudyActivity(session.email, input);
    if (result === "not_found") {
      return NextResponse.json({ error: "Study resource not found." }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json({ error: "This resource is not included with your plan." }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    reportServerError("study_activity.save_failed", error, {
      provider: "supabase",
      route: "/api/study-activity",
      method: "POST",
    });
    return NextResponse.json({ error: "Study activity could not be saved." }, { status: 500 });
  }
}
