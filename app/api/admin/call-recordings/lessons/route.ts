import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { parseRecordingLessonInput } from "@/lib/calls/recordingsInput";
import { createRecordingLesson } from "@/lib/calls/recordings";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody } from "@/lib/security/request";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const input = parseRecordingLessonInput(await readJsonBody(request, 16 * 1024).catch(() => null));
  if (!input) return NextResponse.json({ error: "Check the lesson title and Vimeo link." }, { status: 400 });
  try {
    const lesson = await createRecordingLesson(input);
    return NextResponse.json({ lesson });
  } catch (error) {
    reportServerError("admin.recording_lesson.create_failed", error, {
      provider: "supabase",
      route: "/api/admin/call-recordings/lessons",
      method: "POST",
    });
    return NextResponse.json({ error: "The recording could not be added." }, { status: 500 });
  }
}
