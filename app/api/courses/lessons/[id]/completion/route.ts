import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { setLessonComplete } from "@/lib/courses/queries";

type Context = { params: Promise<{ id: string }> };

async function update(context: Context, complete: boolean) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const ok = await setLessonComplete(session.email, id, complete);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "update_failed" }, { status: 500 });
}

export async function POST(_request: NextRequest, context: Context) { return update(context, true); }
export async function DELETE(_request: NextRequest, context: Context) { return update(context, false); }
