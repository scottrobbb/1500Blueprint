import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { grantStaffRole, revokeStaffRole, type StaffRole } from "@/lib/auth/staff";

type RoleBody = { email?: unknown; role?: unknown };

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as RoleBody | null;
  const parsed = parseBody(body);
  if (!parsed) return NextResponse.json({ error: "Enter a valid account email and role." }, { status: 400 });
  try {
    await grantStaffRole(parsed.email, parsed.role, session.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The role could not be granted." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as RoleBody | null;
  const parsed = parseBody(body);
  if (!parsed) return NextResponse.json({ error: "Enter a valid account email and role." }, { status: 400 });
  await revokeStaffRole(parsed.email, parsed.role);
  return NextResponse.json({ ok: true });
}

function parseBody(body: RoleBody | null): { email: string; role: StaffRole } | null {
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body?.role !== "explanation_editor") return null;
  return { email, role: body.role };
}
