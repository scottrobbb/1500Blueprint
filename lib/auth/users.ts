import { supabaseAdmin } from "@/utils/supabase/admin";
import { reportServerError } from "@/lib/observability/server";

export const COMPLIMENTARY_ACCESS_PLAN = "complimentary";

export type ComplimentaryAccessUser = {
  email: string;
  loginCount: number;
  createdAt: string;
  lastLoginAt: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeComplimentaryEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export async function listComplimentaryAccessUsers(): Promise<ComplimentaryAccessUser[]> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("email,login_count,created_at,last_login_at")
    .eq("plan", COMPLIMENTARY_ACCESS_PLAN)
    .order("created_at", { ascending: false })
    .returns<
      Array<{
        email: string;
        login_count: number;
        created_at: string;
        last_login_at: string | null;
      }>
    >();
  if (error) throw new Error(`failed to list complimentary access: ${error.message}`);

  return data.map((user) => ({
    email: user.email,
    loginCount: user.login_count,
    createdAt: user.created_at,
    lastLoginAt: user.login_count > 0 ? user.last_login_at : null,
  }));
}

export async function grantComplimentaryAccess(email: string): Promise<{ alreadyGranted: boolean }> {
  const normalizedEmail = normalizeComplimentaryEmail(email);
  if (!normalizedEmail) throw new Error("invalid email");

  const { data: existing, error: readError } = await supabaseAdmin()
    .from("users")
    .select("plan")
    .eq("email", normalizedEmail)
    .maybeSingle<{ plan: string | null }>();
  if (readError) throw new Error(`failed to check existing access: ${readError.message}`);

  const alreadyGranted = existing?.plan === COMPLIMENTARY_ACCESS_PLAN;
  if (!alreadyGranted) {
    const { error } = await supabaseAdmin()
      .from("users")
      .upsert(
        { email: normalizedEmail, plan: COMPLIMENTARY_ACCESS_PLAN },
        { onConflict: "email" },
      );
    if (error) throw new Error(`failed to grant complimentary access: ${error.message}`);
  }

  return { alreadyGranted };
}

export async function revokeComplimentaryAccess(email: string): Promise<boolean> {
  const normalizedEmail = normalizeComplimentaryEmail(email);
  if (!normalizedEmail) return false;

  const { data, error } = await supabaseAdmin()
    .from("users")
    .update({ plan: null })
    .eq("email", normalizedEmail)
    .eq("plan", COMPLIMENTARY_ACCESS_PLAN)
    .select("email")
    .maybeSingle<{ email: string }>();
  if (error) throw new Error(`failed to revoke complimentary access: ${error.message}`);
  return Boolean(data);
}

// Complimentary accounts use the same magic-link flow as paying students but
// skip the Stripe lookup. The grant lives in the server-only users table so
// individual email addresses never need to be committed to source.
export type ComplimentaryAccessDependencies = {
  loadAccount: (email: string) => Promise<ComplimentaryAccount | null>;
  hasActiveGrant: (userId: string) => Promise<boolean>;
};

export type ComplimentaryAccount = {
  id: string;
  plan: string | null;
  account_status: string;
};

// Gates whether an account may be sent a magic link and whether a
// complimentary session stays valid.
//
// Two admin tools comp a student and they write different rows. The students
// panel inserts an access_grants row, which is what getStudentAccess reads and
// what the runbook tells staff to use; the older /admin/access page sets
// users.plan. This used to check only users.plan, so a student comped through
// the recommended panel got the entitlement and then silently received no
// login email -- the request route falls through to Stripe, finds no
// subscription, and the response is generic by design so nothing surfaces it.
//
// The grant predicate is the one getStudentAccess uses, so the two agree on
// what an active grant is.
export async function hasComplimentaryAccess(
  email: string,
  dependencies: ComplimentaryAccessDependencies = DEFAULT_COMPLIMENTARY_DEPENDENCIES,
): Promise<boolean> {
  const normalizedEmail = normalizeComplimentaryEmail(email);
  if (!normalizedEmail) return false;
  const account = await dependencies.loadAccount(normalizedEmail);
  if (!account || account.account_status !== "active") return false;
  if (account.plan === COMPLIMENTARY_ACCESS_PLAN) return true;
  return dependencies.hasActiveGrant(account.id);
}

const DEFAULT_COMPLIMENTARY_DEPENDENCIES: ComplimentaryAccessDependencies = {
  loadAccount: async (email) => {
    const { data, error } = await supabaseAdmin()
      .from("users")
      .select("id,plan,account_status")
      .eq("email", email)
      .maybeSingle<ComplimentaryAccount>();
    if (error) throw new Error(`failed to check complimentary access: ${error.message}`);
    return data ?? null;
  },
  hasActiveGrant: async (userId) => {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin()
      .from("access_grants")
      .select("id")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .lte("starts_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(`failed to check complimentary grant: ${error.message}`);
    return Boolean(data);
  },
};

// Upsert a member record on successful login (see record_login() in
// supabase/auth.sql). Non-blocking: a write failure is logged, never blocks login.
export async function recordLogin(email: string, plan: string | null): Promise<void> {
  try {
    const { error } = await supabaseAdmin().rpc("record_login", {
      p_email: email,
      p_plan: plan,
    });
    if (error) {
      reportServerError("auth.legacy_login_record.failed", error, {
        provider: "supabase",
        source: "recordLogin",
      });
    }
  } catch (e) {
    reportServerError("auth.legacy_login_record.failed", e, {
      provider: "supabase",
      source: "recordLogin",
    });
  }
}
