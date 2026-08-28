import "server-only";

import { getSession, type Session } from "./session";
import { isAdminEmail } from "./admin";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { hasActiveStaffAssignment } from "./staff-policy";

export type StaffRole = "explanation_editor";

export type StaffRoleAssignment = {
  email: string;
  name: string | null;
  role: StaffRole;
  grantedBy: string;
  createdAt: string;
};

type StaffRoleRow = {
  email: string;
  role: StaffRole;
  granted_by: string;
  created_at: string;
};

export async function hasStaffRole(email: string, role: StaffRole): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const normalizedEmail = email.trim().toLowerCase();
  const [assignment, account] = await Promise.all([
    supabaseAdmin()
      .from("staff_roles")
      .select("email")
      .eq("email", normalizedEmail)
      .eq("role", role)
      .maybeSingle<{ email: string }>(),
    supabaseAdmin()
      .from("users")
      .select("account_status")
      .eq("email", normalizedEmail)
      .maybeSingle<{ account_status: string }>(),
  ]);
  if (assignment.error) throw new Error(`failed to load staff role: ${assignment.error.message}`);
  if (account.error) throw new Error(`failed to load staff account: ${account.error.message}`);
  return hasActiveStaffAssignment(Boolean(assignment.data), account.data?.account_status);
}

export async function getExplanationEditorSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session || !(await hasStaffRole(session.email, "explanation_editor"))) return null;
  return session;
}

export async function listStaffRoles(): Promise<StaffRoleAssignment[]> {
  const { data, error } = await supabaseAdmin()
    .from("staff_roles")
    .select("email,role,granted_by,created_at")
    .order("created_at", { ascending: false })
    .returns<StaffRoleRow[]>();
  if (error) throw new Error(`failed to list staff roles: ${error.message}`);

  const emails = (data ?? []).map((row) => row.email);
  const users = emails.length
    ? await supabaseAdmin().from("users").select("email,name").in("email", emails).returns<{ email: string; name: string | null }[]>()
    : { data: [] as { email: string; name: string | null }[], error: null };
  if (users.error) throw new Error(`failed to load staff accounts: ${users.error.message}`);
  const names = new Map((users.data ?? []).map((user) => [user.email, user.name]));

  return (data ?? []).map((row) => ({
    email: row.email,
    name: names.get(row.email) ?? null,
    role: row.role,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  }));
}

export async function grantStaffRole(email: string, role: StaffRole, grantedBy: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const account = await supabaseAdmin()
    .from("users")
    .select("email,account_status")
    .eq("email", normalizedEmail)
    .maybeSingle<{ email: string; account_status: string }>();
  if (account.error) throw new Error(`failed to load staff account: ${account.error.message}`);
  if (!account.data) throw new Error("That email does not have a Blueprint account yet.");
  if (account.data.account_status !== "active") throw new Error("That account is not active.");

  const { error } = await supabaseAdmin().from("staff_roles").upsert({
    email: normalizedEmail,
    role,
    granted_by: grantedBy.trim().toLowerCase(),
  }, { onConflict: "email,role" });
  if (error) throw new Error(`failed to grant staff role: ${error.message}`);
}

export async function revokeStaffRole(email: string, role: StaffRole): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("staff_roles")
    .delete()
    .eq("email", email.trim().toLowerCase())
    .eq("role", role);
  if (error) throw new Error(`failed to revoke staff role: ${error.message}`);
}
