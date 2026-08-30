import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { billingBaseUrl } from "@/lib/billing/config";
import { resetProtectedContentLimits } from "@/lib/security/protected-content";
import { reportServerError } from "@/lib/observability/server";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const baseUrl = billingBaseUrl(request.url);
  const formData = await request.formData();
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    return redirect(baseUrl, "invalid");
  }

  try {
    const cleared = await resetProtectedContentLimits(email.trim());
    return redirect(baseUrl, cleared > 0 ? "success" : "none");
  } catch (error) {
    reportServerError("admin.rate_limits.reset_failed", error, {
      provider: "supabase",
      route: "/api/admin/rate-limits/reset",
      method: "POST",
    });
    return redirect(baseUrl, "error");
  }
}

function redirect(baseUrl: string, state: string) {
  return NextResponse.redirect(
    new URL(`/ultimate/admin/students?rate_limit_reset=${encodeURIComponent(state)}`, baseUrl),
    303,
  );
}
