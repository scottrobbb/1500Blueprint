import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { parseRecordingMonthInput } from "@/lib/calls/recordingsInput";
import { createRecordingMonth } from "@/lib/calls/recordings";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const input = parseRecordingMonthInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Pick a month to add." }, { status: 400 });
  try {
    const month = await createRecordingMonth(input);
    return NextResponse.json({ month });
  } catch (error) {
    console.error("recording month creation failed", error);
    return NextResponse.json({ error: "That month could not be added. It may already exist." }, { status: 500 });
  }
}
