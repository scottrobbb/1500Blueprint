import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  parseDailyGoal,
} from "@/lib/settings/progress";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rate = await checkRateLimit("progress-settings-write", session.email, { limit: 60, windowSeconds: 60 * 60 });
  if (!rate) return NextResponse.json({ error: "Settings are temporarily unavailable" }, { status: 503 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many settings updates", resetsAt: rate.resetsAt }, { status: 429 });

  const body = (await readJsonBody(request, 4 * 1024).catch(() => null)) as
    | { dailyGoal?: unknown }
    | null;
  const dailyGoal = parseDailyGoal(body?.dailyGoal);
  if (dailyGoal === null) {
    return NextResponse.json(
      { error: `Choose a daily goal from ${MIN_DAILY_GOAL} to ${MAX_DAILY_GOAL}.` },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin()
    .from("users")
    .update({ daily_goal_target: dailyGoal })
    .eq("email", session.email.trim().toLowerCase())
    .select("daily_goal_target")
    .maybeSingle<{ daily_goal_target: number }>();

  if (error) {
    reportServerError("settings.daily_goal.update_failed", error, {
      provider: "supabase",
      route: "/api/settings/progress",
      method: "PATCH",
    });
    return NextResponse.json({ error: "Could not save your daily goal." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
  }

  return NextResponse.json({ dailyGoal: data.daily_goal_target });
}
