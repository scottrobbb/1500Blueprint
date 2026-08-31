import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { billingBaseUrl } from "@/lib/billing/config";
import { grantAdminAccess, revokeAdminAccess } from "@/lib/auth/grants";
import { reportServerError } from "@/lib/observability/server";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const baseUrl = billingBaseUrl(request.url);
  const formData = await request.formData();
  const email = formData.get("email");
  const intent = formData.get("intent");
  const reason = formData.get("reason");
  if (typeof email !== "string" || !email.trim()) return redirect(baseUrl, "invalid");

  try {
    if (intent === "revoke") {
      const result = await revokeAdminAccess(email);
      return redirect(baseUrl, result.status === "revoked" ? "revoked" : result.status === "invalid_email" ? "invalid" : "not_granted");
    }

    const result = await grantAdminAccess(
      email,
      "max",
      session.email,
      typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : null,
    );
    if (result.status === "invalid_email") return redirect(baseUrl, "invalid");
    return redirect(baseUrl, result.replacedExisting ? "replaced" : "granted");
  } catch (error) {
    reportServerError("admin.access_grant.failed", error, {
      provider: "supabase",
      route: "/api/admin/access-grants",
      method: "POST",
    });
    return redirect(baseUrl, "error");
  }
}

function redirect(baseUrl: string, state: string) {
  return NextResponse.redirect(
    new URL(`/ultimate/admin/students?access_grant=${encodeURIComponent(state)}`, baseUrl),
    303,
  );
}
