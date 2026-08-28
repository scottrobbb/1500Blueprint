import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { markNotificationsRead } from "@/lib/community/notifications";
import { readJsonBody } from "@/lib/security/request";

// Mark notifications read for the signed-in member. Body: { ids?: string[] } —
// omit ids to clear everything (what opening the bell does).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await readJsonBody(req, 32 * 1024).catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((i) => typeof i === "string" && i.length > 0 && i.length <= 160).slice(0, 100)
    : undefined;
  if (Array.isArray(body.ids) && ids?.length !== body.ids.length) {
    return NextResponse.json({ error: "invalid_ids" }, { status: 400 });
  }
  await markNotificationsRead(session.email, ids);
  return NextResponse.json({ ok: true });
}
