import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { parseRecordingLessonInput } from "@/lib/calls/recordingsInput";
import { deleteRecordingLesson, updateRecordingLesson } from "@/lib/calls/recordings";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await context.params;
  const input = parseRecordingLessonInput(await request.json().catch(() => null));
  if (!id || id.length > 160 || !input) return NextResponse.json({ error: "Check the lesson title and Vimeo link." }, { status: 400 });
  try {
    const lesson = await updateRecordingLesson(id, input);
    return NextResponse.json({ lesson });
  } catch (error) {
    console.error("recording lesson update failed", error);
    return NextResponse.json({ error: "The recording could not be updated." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await context.params;
  if (!id || id.length > 160) return NextResponse.json({ error: "Invalid recording" }, { status: 400 });
  try {
    await deleteRecordingLesson(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("recording lesson deletion failed", error);
    return NextResponse.json({ error: "The recording could not be deleted." }, { status: 500 });
  }
}
