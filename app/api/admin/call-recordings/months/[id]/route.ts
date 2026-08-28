import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { deleteRecordingMonth } from "@/lib/calls/recordings";
import { reportServerError } from "@/lib/observability/server";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await context.params;
  if (!id || id.length > 160) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  try {
    await deleteRecordingMonth(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    reportServerError("admin.recording_month.delete_failed", error, {
      provider: "supabase",
      route: "/api/admin/call-recordings/months/[id]",
      method: "DELETE",
    });
    return NextResponse.json({ error: "That month could not be deleted." }, { status: 500 });
  }
}
