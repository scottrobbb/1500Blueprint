import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseStudyActivityInput } from "@/lib/home/continuation-policy";
import { recordStudyActivity } from "@/lib/home/continuation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
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
    console.error("study activity save failed", error);
    return NextResponse.json({ error: "Study activity could not be saved." }, { status: 500 });
  }
}
