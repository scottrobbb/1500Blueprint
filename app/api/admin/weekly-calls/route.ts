import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { parseWeeklyCallInput } from "@/lib/calls/input";
import { createWeeklyCall } from "@/lib/calls/queries";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const input = parseWeeklyCallInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Check the call title, dates, status, and links." }, { status: 400 });
  try {
    const result = await createWeeklyCall(input, session.email);
    return NextResponse.json(result);
  } catch (error) {
    console.error("weekly call creation failed", error);
    return NextResponse.json({ error: "The weekly call could not be created." }, { status: 500 });
  }
}
