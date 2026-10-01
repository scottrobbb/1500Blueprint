import "server-only";
import { getStudentAccess } from "./entitlements";
import { supabaseAdmin } from "@/utils/supabase/admin";
import type { StudentAccess } from "./plans";

export type AppAccessLogin = { active: boolean; plan: string | null };

export type AppAccessLoginDependencies = {
  getStudentAccess(email: string): Promise<Pick<StudentAccess, "active" | "plan">>;
  storedPlan(email: string): Promise<string | null>;
};

// getMembership only sees Stripe subscriptions, so paid access that is not a
// subscription -- a one-week Max pass, an admin access grant -- never earned a
// login link. This asks the app's own entitlement check instead.
//
// The plan carried on the login token is the account's stored users.plan,
// unchanged: record_login writes the token's plan back to users.plan, and an
// account with no tracked subscription takes that column as its plan. Writing
// the pass's "max" there would keep Max after the pass expired.
export async function appAccessLogin(
  email: string,
  dependencies: AppAccessLoginDependencies = defaultDependencies,
): Promise<AppAccessLogin> {
  const access = await dependencies.getStudentAccess(email);
  if (!access.active || access.plan === "free") return { active: false, plan: null };
  return { active: true, plan: await dependencies.storedPlan(email) };
}

const defaultDependencies: AppAccessLoginDependencies = {
  getStudentAccess,
  async storedPlan(email) {
    const { data, error } = await supabaseAdmin()
      .from("users")
      .select("plan")
      .eq("email", email)
      .maybeSingle<{ plan: string | null }>();
    if (error) throw new Error(`failed to load stored plan: ${error.message}`);
    return data?.plan ?? null;
  },
};
