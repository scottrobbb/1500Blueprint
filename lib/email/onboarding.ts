import "server-only";

import { CANONICAL_APP_URL } from "@/lib/auth/config";
import { reportServerError } from "@/lib/observability/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { queueStudentContact, syncStudentContact } from "./audience";
import { sendTrackedEmail } from "./send";
import { welcomeEmail } from "./templates";

export type EmailOnboardingAccount = {
  id: string;
  email: string;
  name?: string | null;
  created: boolean;
};

export async function onboardStudentEmail(account: EmailOnboardingAccount): Promise<void> {
  try {
    await queueStudentContact(account.email);
    await syncStudentContact(account.email);
  } catch (error) {
    reportServerError("email.onboarding.contact_failed", error, {
      provider: "resend",
      source: "onboardStudentEmail",
    });
  }

  if (!account.created) return;
  try {
    await sendTrackedEmail({
      kind: "welcome",
      to: account.email,
      userId: account.id,
      idempotencyKey: `welcome/${account.id}`,
      message: welcomeEmail(firstName(account.name), `${CANONICAL_APP_URL}/ultimate`),
    });
  } catch (error) {
    reportServerError("email.onboarding.welcome_failed", error, {
      provider: "resend",
      source: "onboardStudentEmail",
    });
  }
}

export async function onboardStudentEmailByEmail(email: string): Promise<void> {
  const result = await supabaseAdmin()
    .from("users")
    .select("id,email,name")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<{ id: string; email: string; name: string | null }>();
  if (result.error || !result.data) {
    if (result.error) reportServerError("email.onboarding.account_failed", result.error, { provider: "supabase", source: "onboardStudentEmailByEmail" });
    return;
  }
  await onboardStudentEmail({ ...result.data, created: false });
}

function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}
