import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  parseDailyGoal,
} from "@/lib/settings/progress";
import { supabaseAdmin } from "@/utils/supabase/admin";

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
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
    console.error("daily goal update failed", error);
    return NextResponse.json({ error: "Could not save your daily goal." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
  }

  return NextResponse.json({ dailyGoal: data.daily_goal_target });
}
