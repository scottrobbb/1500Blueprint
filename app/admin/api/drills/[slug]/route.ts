import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import {
  ContentPublicationError,
  updateDrill,
  type DrillUpdate,
} from "@/lib/drills/admin-queries";
import { isPublicationStatus } from "@/lib/flags";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => null)) as DrillUpdate | null;
  if (!body || (body.status !== undefined && !isPublicationStatus(body.status))) {
    return NextResponse.json({ error: "invalid_body", detail: "Choose a valid drill publication status." }, { status: 400 });
  }
  try {
    await updateDrill(slug, body);
  } catch (error) {
    console.error("update drill failed", error);
    const invalid = error instanceof ContentPublicationError;
    return NextResponse.json(
      { error: "save_failed", detail: invalid ? error.message : "The drill settings could not be saved." },
      { status: invalid ? 400 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
