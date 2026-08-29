import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { isAdminEmail } from "@/lib/auth/admin";
import { isComplimentaryAccount } from "@/lib/auth/complimentary";
import { billingLivemode } from "@/lib/billing/config";
import { PAID_ACCESS_STATUSES } from "@/lib/billing/policy";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody } from "@/lib/security/request";
import { onboardStudentEmailByEmail } from "@/lib/email/onboarding";

type AccountRow = {
  id: string;
  email: string;
  plan: string | null;
  account_status: "active" | "suspended" | "archived";
  is_test_account: boolean;
};

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const adminSession = await getAdminSession();
  if (!adminSession) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await readJsonBody(request, 4 * 1024).catch(() => null)) as { status?: unknown } | null;
  const status = body?.status;
  if (status !== "active" && status !== "suspended") {
    return NextResponse.json({ error: "Choose active or suspended access." }, { status: 400 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const db = supabaseAdmin();
  const { data: account, error: accountError } = await db
    .from("users")
    .select("id,email,plan,account_status,is_test_account")
    .eq("id", id)
    .maybeSingle<AccountRow>();

  if (accountError) {
    reportServerError("admin.student_access.load_failed", accountError, {
      provider: "supabase",
      route: "/admin/api/students/[id]/access",
      method: "PATCH",
    });
    return NextResponse.json({ error: "The student account could not be loaded." }, { status: 500 });
  }
  if (!account) return NextResponse.json({ error: "Student not found." }, { status: 404 });
  if (account.account_status === "archived") {
    return NextResponse.json({ error: "Archived accounts cannot be changed here." }, { status: 409 });
  }
  if (isAdminEmail(account.email)) {
    return NextResponse.json({ error: "Admin accounts cannot be suspended here." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const [{ data: grant, error: grantError }, { data: subscription, error: subscriptionError }] =
    await Promise.all([
      db
        .from("access_grants")
        .select("id,plan_code")
        .eq("user_id", account.id)
        .is("revoked_at", null)
        .lte("starts_at", now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .limit(1)
        .maybeSingle<{ id: string; plan_code: string }>(),
      db
        .from("student_subscriptions")
        .select("id")
        .eq("user_id", account.id)
        .eq("livemode", billingLivemode())
        .in("status", [...PAID_ACCESS_STATUSES])
        .limit(1)
        .maybeSingle<{ id: string }>(),
    ]);

  if (grantError || subscriptionError) {
    if (grantError) {
      reportServerError("admin.student_access.grant_check_failed", grantError, {
        provider: "supabase",
        route: "/admin/api/students/[id]/access",
        method: "PATCH",
      });
    }
    if (subscriptionError) {
      reportServerError("admin.student_access.subscription_check_failed", subscriptionError, {
        provider: "supabase",
        route: "/admin/api/students/[id]/access",
        method: "PATCH",
      });
    }
    return NextResponse.json({ error: "The student's access could not be verified." }, { status: 500 });
  }

  if (!isComplimentaryAccount({
    legacyPlan: account.plan,
    isTestAccount: account.is_test_account,
    activeGrantPlan: grant?.plan_code,
    hasPaidSubscription: subscription !== null,
  })) {
    return NextResponse.json(
      { error: "Only complimentary students can be managed with this control." },
      { status: 409 },
    );
  }

  if (account.account_status === status) {
    return NextResponse.json({ ok: true, accountStatus: status });
  }

  const { data: updated, error: updateError } = await db
    .from("users")
    .update({ account_status: status, updated_at: new Date().toISOString() })
    .eq("id", account.id)
    .eq("account_status", account.account_status)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError) {
    reportServerError("admin.student_access.update_failed", updateError, {
      provider: "supabase",
      route: "/admin/api/students/[id]/access",
      method: "PATCH",
    });
    return NextResponse.json({ error: "The access change could not be saved." }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "The account changed while this request was running. Refresh and try again." },
      { status: 409 },
    );
  }

  revalidatePath("/admin/students");
  revalidatePath("/ultimate/admin/students");
  after(() => onboardStudentEmailByEmail(account.email));
  return NextResponse.json({ ok: true, accountStatus: status });
}
