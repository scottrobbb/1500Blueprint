// In-progress practice-test persistence. The runner POSTs the serialized state
// here (on exit, on each module submit, and on a debounce while testing) so a
// student can resume exactly where they left off; DELETE clears it on "Start over".

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { saveTestSession, clearTestSession } from "@/lib/sat/testSession";
import type { TestState } from "@/lib/sat/testState";
import type { Highlight } from "@/components/test/HighlightablePassage";
import { isAdminEmail } from "@/lib/auth/admin";
import { canAccessPracticeTestPublication } from "@/lib/sat/loadTest";
import { canAccessPracticeTest } from "@/lib/auth/access-control";

type SaveBody = {
  testSlug?: string;
  state?: TestState;
  highlights?: Record<string, Highlight[]>;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.testSlug || !body.state || typeof body.state !== "object") {
    return NextResponse.json({ error: "testSlug and state are required" }, { status: 400 });
  }
  const isAdmin = isAdminEmail(session.email);
  if (!isAdmin && !(await canAccessPracticeTest(session.email, body.testSlug))) {
    return NextResponse.json({ error: "This practice test is not included with your plan." }, { status: 402 });
  }
  if (!(await canAccessPracticeTestPublication(body.testSlug, isAdmin))) {
    return NextResponse.json({ error: "Practice test is not published" }, { status: 404 });
  }

  try {
    await saveTestSession(session.email, body.testSlug, {
      state: body.state,
      highlights: body.highlights ?? {},
    });
  } catch (e) {
    console.error("save test session failed:", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const testSlug = new URL(req.url).searchParams.get("testSlug");
  if (!testSlug) {
    return NextResponse.json({ error: "testSlug is required" }, { status: 400 });
  }
  if (!(await canAccessPracticeTestPublication(testSlug, isAdminEmail(session.email)))) {
    return NextResponse.json({ error: "Practice test is not published" }, { status: 404 });
  }

  try {
    await clearTestSession(session.email, testSlug);
  } catch (e) {
    console.error("clear test session failed:", e);
    return NextResponse.json({ error: "Clear failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
