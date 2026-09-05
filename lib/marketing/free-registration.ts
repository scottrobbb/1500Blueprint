import "server-only";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { reportServerError } from "@/lib/observability/server";
import { conversionContext } from "./context";
import { registrationPayload } from "./conversions";
import { conversionsEnabled, enqueueConversion, saveConversionContext } from "./delivery";

// Runs only after signup and verification-email delivery succeed. Account
// claims, sign-ins, page visits and failed forms never call this function.
export async function notifyFreeRegistration(notice: { email: string; name: string }): Promise<void> {
  if (!conversionsEnabled()) return;
  const email = notice.email.trim().toLowerCase();
  try {
    const context = await conversionContext("/account/sign-up");
    await saveConversionContext(email, context);
    // Preserve the old integration's duplicate guard across the rollout.
    const { data, error } = await supabaseAdmin().from("free_signup_attribution")
      .select("notified_at").eq("email", email).maybeSingle<{ notified_at: string | null }>();
    if (error) throw new Error(`Could not check prior conversion: ${error.code}`);
    if (data?.notified_at) return;
    await enqueueConversion(registrationPayload(email, notice.name, context, new Date()));
  } catch (error) {
    reportServerError("marketing.registration.queue_failed", error, { provider: "supabase" });
  }
}
