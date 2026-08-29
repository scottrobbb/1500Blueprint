import "server-only";

import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/utils/supabase/admin";

export type StudentAccount = {
  id: string;
  email: string;
  plan: string | null;
  authUserId: string;
  status: "active" | "suspended" | "archived";
  name: string | null;
  created: boolean;
};

type AccountRow = {
  id: string;
  email: string;
  plan: string | null;
  auth_user_id: string;
  account_status: StudentAccount["status"];
  is_new?: boolean;
};

export async function recordPasswordLogin(
  user: User,
  options: { allowCreate?: boolean } = {},
): Promise<StudentAccount> {
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.email_confirmed_at) {
    throw new Error("A verified email is required to create a student account");
  }

  const displayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim()
      : null;

  const { data, error } = await supabaseAdmin()
    .rpc("record_password_login", {
      p_auth_user_id: user.id,
      p_email: email,
      p_display_name: displayName || null,
      p_allow_create: options.allowCreate ?? false,
    })
    .single<AccountRow>();

  if (error || !data) {
    throw new Error(`failed to link password account: ${error?.message ?? "no account returned"}`);
  }

  return {
    id: data.id,
    email: data.email,
    plan: data.plan,
    authUserId: data.auth_user_id,
    status: data.account_status,
    name: displayName,
    created: Boolean(data.is_new),
  };
}

export async function findStudentAccount(email: string): Promise<StudentAccount | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("id,email,plan,auth_user_id,account_status")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<AccountRow>();

  if (error) throw new Error(`failed to load student account: ${error.message}`);
  if (!data?.auth_user_id) return null;

  return {
    id: data.id,
    email: data.email,
    plan: data.plan,
    authUserId: data.auth_user_id,
    status: data.account_status,
    name: null,
    created: false,
  };
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`failed to search auth users: ${error.message}`);

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
    if (user) return user;
    if (data.users.length < perPage) return null;
  }

  throw new Error("auth user search exceeded the supported page limit");
}
