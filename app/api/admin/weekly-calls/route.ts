import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { parseWeeklyCallInput } from "@/lib/calls/input";
import { createWeeklyCall } from "@/lib/calls/queries";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody } from "@/lib/security/request";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const input = parseWeeklyCallInput(await readJsonBody(request, 16 * 1024).catch(() => null));
  if (!input) return NextResponse.json({ error: "Check the call title, dates, status, and links." }, { status: 400 });
  try {
    const result = await createWeeklyCall(input, session.email);
    return NextResponse.json(result);
  } catch (error) {
    reportServerError("admin.weekly_call.create_failed", error, {
      provider: "supabase",
      route: "/api/admin/weekly-calls",
      method: "POST",
    });
    return NextResponse.json({ error: "The weekly call could not be created." }, { status: 500 });
  }
}
