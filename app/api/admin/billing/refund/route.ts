import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { billingBaseUrl } from "@/lib/billing/config";
import { BillingRefundError, refundFirstPurchase } from "@/lib/billing/refunds";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const baseUrl = billingBaseUrl(request.url);
  const formData = await request.formData();
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    return redirect(baseUrl, "account");
  }

  try {
    await refundFirstPurchase(email, session.email);
    return redirect(baseUrl, "success");
  } catch (error) {
    console.error("Admin Stripe refund failed:", error);
    return redirect(baseUrl, error instanceof BillingRefundError ? error.code : "error");
  }
}

function redirect(baseUrl: string, state: string) {
  return NextResponse.redirect(
    new URL(`/ultimate/admin/students?billing_refund=${encodeURIComponent(state)}`, baseUrl),
    303,
  );
}
