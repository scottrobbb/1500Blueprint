import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import {
  ContentPublicationError,
  updateDrill,
  type DrillUpdate,
} from "@/lib/drills/admin-queries";
import { isPublicationStatus } from "@/lib/flags";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody } from "@/lib/security/request";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { slug } = await ctx.params;
  const body = (await readJsonBody(req, 64 * 1024).catch(() => null)) as DrillUpdate | null;
  if (!body || (body.status !== undefined && !isPublicationStatus(body.status))) {
    return NextResponse.json({ error: "invalid_body", detail: "Choose a valid drill publication status." }, { status: 400 });
  }
  try {
    await updateDrill(slug, body);
  } catch (error) {
    const invalid = error instanceof ContentPublicationError;
    if (!invalid) {
      reportServerError("admin.drill.update_failed", error, {
        provider: "supabase",
        route: "/admin/api/drills/[slug]",
        method: "PUT",
      });
    }
    return NextResponse.json(
      { error: "save_failed", detail: invalid ? error.message : "The drill settings could not be saved." },
      { status: invalid ? 400 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
