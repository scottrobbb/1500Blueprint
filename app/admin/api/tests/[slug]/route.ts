import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import {
  TestPublicationError,
  updateTestSettings,
  type TestSettingsUpdate,
} from "@/lib/sat/admin-queries";
import { isPublicationStatus } from "@/lib/flags";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody } from "@/lib/security/request";

// Practice-test settings endpoint. Authorizes with getAdminSession() before the
// service-role write. Next 16: ctx.params is a Promise.
type Ctx = { params: Promise<{ slug: string }> };

const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

// A finite number in (0, 1], else undefined (leaves the column unchanged).
function fraction(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : undefined;
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  if (!(await getAdminSession())) return forbidden();
  const { slug } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req, 16 * 1024)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if ("status" in body && !isPublicationStatus(body.status)) {
    return NextResponse.json(
      { error: "invalid status", detail: "Choose Draft or Published for the test status." },
      { status: 400 },
    );
  }

  const patch: TestSettingsUpdate = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();

  const breakMinutes = Number(body.breakMinutes);
  if (Number.isFinite(breakMinutes) && breakMinutes >= 0 && breakMinutes <= 60) {
    patch.breakMinutes = Math.round(breakMinutes);
  }

  const rw = fraction(body.rwThreshold);
  if (rw !== undefined) patch.rwThreshold = rw;
  const math = fraction(body.mathThreshold);
  if (math !== undefined) patch.mathThreshold = math;
  if (isPublicationStatus(body.status)) patch.status = body.status;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  try {
    await updateTestSettings(slug, patch);
  } catch (e) {
    const invalid = e instanceof TestPublicationError;
    if (!invalid) {
      reportServerError("admin.test_settings.update_failed", e, {
        provider: "supabase",
        route: "/admin/api/tests/[slug]",
        method: "PUT",
      });
    }
    return NextResponse.json(
      { error: "save failed", detail: invalid ? e.message : "The test settings could not be saved." },
      { status: invalid ? 400 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
