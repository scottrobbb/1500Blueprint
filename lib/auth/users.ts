import { supabaseAdmin } from "@/utils/supabase/admin";

export const COMPLIMENTARY_ACCESS_PLAN = "complimentary";

// Complimentary accounts use the same magic-link flow as paying students but
// skip the Stripe lookup. The grant lives in the server-only users table so
// individual email addresses never need to be committed to source.
export async function hasComplimentaryAccess(email: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("plan,account_status")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<{ plan: string | null; account_status: string }>();
  if (error) throw new Error(`failed to check complimentary access: ${error.message}`);
  return data?.plan === COMPLIMENTARY_ACCESS_PLAN && data.account_status === "active";
}

// Upsert a member record on successful login (see record_login() in
// supabase/auth.sql). Non-blocking: a write failure is logged, never blocks login.
export async function recordLogin(email: string, plan: string | null): Promise<void> {
  try {
    const { error } = await supabaseAdmin().rpc("record_login", {
      p_email: email,
      p_plan: plan,
    });
    if (error) console.error("recordLogin failed:", error.message);
  } catch (e) {
    console.error("recordLogin threw:", (e as Error)?.message ?? e);
  }
}
