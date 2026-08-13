import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { togglePinned } from "@/lib/community/queries";

// Toggle a post's pinned state; admin-only (intentionally isAdminEmail, not
// canModeratePost — pinning stays admin-only even though authors can delete
// their own posts). Returns { pinned }.
// Next 16: ctx.params is a Promise.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminEmail(session.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const result = await togglePinned(id);
  return NextResponse.json(result);
}
