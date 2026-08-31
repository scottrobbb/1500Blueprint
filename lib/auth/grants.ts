import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import { normalizeComplimentaryEmail } from "./users";
import type { PlanCode } from "./plans";

// Complimentary access is written to access_grants rather than users.plan.
// effectivePlan only falls back to the legacy users.plan when a student has no
// tracked subscription at all (see getStudentAccess), so a legacy write would
// silently do nothing for anyone who has ever had a Stripe subscription --
// including a lapsed or cancelled one. A grant wins on its own merits.
export type AdminGrant = {
  email: string;
  plan: PlanCode;
  reason: string | null;
  grantedBy: string | null;
  createdAt: string;
  expiresAt: string | null;
};

export type GrantResult =
  | { status: "granted"; email: string; replacedExisting: boolean }
  | { status: "invalid_email" };

export type RevokeResult = { status: "revoked" | "not_granted" | "invalid_email" };

type UserRow = { id: string };

export async function grantAdminAccess(
  rawEmail: string,
  plan: PlanCode,
  grantedBy: string,
  reason: string | null = null,
): Promise<GrantResult> {
  const email = normalizeComplimentaryEmail(rawEmail);
  if (!email) return { status: "invalid_email" };

  const db = supabaseAdmin();
  // Granting before a student's first sign-in is a normal case (comping someone
  // who has been told to sign up), so the account row is created if missing.
  const { data: user, error: userError } = await db
    .from("users")
    .upsert({ email }, { onConflict: "email", ignoreDuplicates: false })
    .select("id")
    .single<UserRow>();
  if (userError || !user) {
    throw new Error(`failed to prepare account for grant: ${userError?.message ?? "no row returned"}`);
  }

  // One active admin grant per student: revoking first keeps the history
  // append-only while leaving exactly one row for getStudentAccess to read.
  const replacedExisting = await revokeActiveGrants(user.id);

  const { error } = await db.from("access_grants").insert({
    user_id: user.id,
    plan_code: plan,
    source: "admin",
    reason,
    granted_by: grantedBy,
  });
  if (error) throw new Error(`failed to grant access: ${error.message}`);

  return { status: "granted", email, replacedExisting };
}

export async function revokeAdminAccess(rawEmail: string): Promise<RevokeResult> {
  const email = normalizeComplimentaryEmail(rawEmail);
  if (!email) return { status: "invalid_email" };

  const db = supabaseAdmin();
  const { data: user, error: userError } = await db
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle<UserRow>();
  if (userError) throw new Error(`failed to look up account: ${userError.message}`);
  if (!user) return { status: "not_granted" };

  return { status: (await revokeActiveGrants(user.id)) ? "revoked" : "not_granted" };
}

export async function listAdminGrants(): Promise<AdminGrant[]> {
  const now = new Date().toISOString();
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("access_grants")
    .select("user_id,plan_code,reason,granted_by,created_at,expires_at")
    .eq("source", "admin")
    .is("revoked_at", null)
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<{
      user_id: string;
      plan_code: string;
      reason: string | null;
      granted_by: string | null;
      created_at: string;
      expires_at: string | null;
    }[]>();
  if (error) throw new Error(`failed to list access grants: ${error.message}`);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: users, error: usersError } = await db
    .from("users")
    .select("id,email")
    .in("id", rows.map((row) => row.user_id))
    .returns<{ id: string; email: string }[]>();
  if (usersError) throw new Error(`failed to load granted accounts: ${usersError.message}`);

  const emails = new Map((users ?? []).map((user) => [user.id, user.email]));
  return rows.map((row) => ({
    email: emails.get(row.user_id) ?? row.user_id,
    plan: row.plan_code === "max" || row.plan_code === "core" ? row.plan_code : "free",
    reason: row.reason,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

async function revokeActiveGrants(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("access_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("source", "admin")
    .is("revoked_at", null)
    .select("id")
    .returns<{ id: string }[]>();
  if (error) throw new Error(`failed to revoke existing grant: ${error.message}`);
  return (data ?? []).length > 0;
}
