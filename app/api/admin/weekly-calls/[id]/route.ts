import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { parseWeeklyCallInput } from "@/lib/calls/input";
import { deleteWeeklyCall, updateWeeklyCall } from "@/lib/calls/queries";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody } from "@/lib/security/request";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await context.params;
  const input = parseWeeklyCallInput(await readJsonBody(request, 16 * 1024).catch(() => null));
  if (!id || id.length > 160 || !input) return NextResponse.json({ error: "Check the call title, dates, status, and links." }, { status: 400 });
  try {
    return NextResponse.json(await updateWeeklyCall(id, input));
  } catch (error) {
    reportServerError("admin.weekly_call.update_failed", error, {
      provider: "supabase",
      route: "/api/admin/weekly-calls/[id]",
      method: "PUT",
    });
    return NextResponse.json({ error: "The weekly call could not be updated." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await context.params;
  if (!id || id.length > 160) return NextResponse.json({ error: "Invalid call" }, { status: 400 });
  try {
    await deleteWeeklyCall(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    reportServerError("admin.weekly_call.delete_failed", error, {
      provider: "supabase",
      route: "/api/admin/weekly-calls/[id]",
      method: "DELETE",
    });
    return NextResponse.json({ error: "The weekly call could not be deleted." }, { status: 500 });
  }
}
