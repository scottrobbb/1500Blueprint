import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { grantStaffRole, revokeStaffRole, type StaffRole } from "@/lib/auth/staff";
import { normalizeEmailInput, readJsonBody } from "@/lib/security/request";
import { reportServerError } from "@/lib/observability/server";

type RoleBody = { email?: unknown; role?: unknown };

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await readJsonBody(request, 4 * 1024).catch(() => null)) as RoleBody | null;
  const parsed = parseBody(body);
  if (!parsed) return NextResponse.json({ error: "Enter a valid account email and role." }, { status: 400 });
  try {
    await grantStaffRole(parsed.email, parsed.role, session.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "That email does not have a Blueprint account yet." || message === "That account is not active.") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    reportServerError("admin.staff_role.grant_failed", error, {
      provider: "supabase",
      route: "/api/admin/staff/roles",
      method: "POST",
    });
    return NextResponse.json({ error: "The role could not be granted." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await readJsonBody(request, 4 * 1024).catch(() => null)) as RoleBody | null;
  const parsed = parseBody(body);
  if (!parsed) return NextResponse.json({ error: "Enter a valid account email and role." }, { status: 400 });
  await revokeStaffRole(parsed.email, parsed.role);
  return NextResponse.json({ ok: true });
}

function parseBody(body: RoleBody | null): { email: string; role: StaffRole } | null {
  const email = normalizeEmailInput(body?.email);
  if (!email || body?.role !== "explanation_editor") return null;
  return { email, role: body.role };
}
