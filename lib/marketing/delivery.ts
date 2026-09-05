import "server-only";
import { after } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { reportServerError, reportServerEvent } from "@/lib/observability/server";
import { isConversionExpired, retryAt, type ConversionContext, type ConversionPayload } from "./conversions";

export function conversionsEnabled(): boolean {
  return process.env.META_CONVERSIONS_ENABLED === "true" && process.env.VERCEL_ENV === "production";
}

export function conversionWebhook(eventName: ConversionPayload["event_name"]): string | null {
  const value = process.env[eventName === "Purchase" ? "ZAPIER_PURCHASE_WEBHOOK_URL" : "ZAPIER_FREE_REGISTER_WEBHOOK_URL"];
  try {
    const url = new URL(value?.trim() ?? "");
    return url.protocol === "https:" && url.hostname === "hooks.zapier.com"
      && /^\/hooks\/catch\/\d+\/[^/]+\/$/.test(url.pathname) && !url.search && !url.username && !url.password
      ? url.toString() : null;
  } catch { return null; }
}

export async function saveConversionContext(email: string, context: ConversionContext): Promise<void> {
  const { error } = await supabaseAdmin().rpc("save_marketing_attribution", { p_email: email, p_context: context });
  if (error) throw new Error(`Could not save attribution: ${error.code}`);
}

export async function loadConversionContext(email: string): Promise<ConversionContext | null> {
  const { data, error } = await supabaseAdmin().from("marketing_attribution").select("context").eq("email", email).maybeSingle<{ context: ConversionContext }>();
  if (error) throw new Error(`Could not load attribution: ${error.code}`);
  return data?.context ?? null;
}

export async function enqueueConversion(payload: ConversionPayload): Promise<void> {
  if (!conversionsEnabled()) return;
  const { error } = await supabaseAdmin().from("marketing_conversion_events").upsert({
    event_id: payload.event_id, email: payload.email, event_name: payload.event_name, payload,
  }, { onConflict: "event_id", ignoreDuplicates: true });
  if (error) throw new Error(`Could not queue conversion: ${error.code}`);
  // Persist before returning; the cron recovers if this invocation terminates.
  after(async () => { await deliverConversions(payload.event_id); });
}

type DeliveryRow = { event_id: string; event_name: ConversionPayload["event_name"]; payload: ConversionPayload; attempts: number };

export async function deliverConversions(eventId: string | null = null): Promise<{ accepted: number; retrying: number; expired: number }> {
  const totals = { accepted: 0, retrying: 0, expired: 0 };
  if (!conversionsEnabled()) return totals;
  const { data, error } = await supabaseAdmin().rpc("claim_marketing_conversions", { p_event_id: eventId, p_limit: 10 }).overrideTypes<DeliveryRow[], { merge: false }>();
  if (error) throw new Error(`Could not claim conversions: ${error.code}`);
  if (!Array.isArray(data)) throw new Error("Conversion claim returned an invalid result");
  for (const row of data) {
    let state: "accepted_by_zapier" | "pending" | "expired" = "pending";
    let lastError: string | null = null;
    if (isConversionExpired(row.payload.event_time, new Date())) {
      state = "expired";
      lastError = "Event expired before acceptance";
      totals.expired++;
    } else {
      try {
        const url = conversionWebhook(row.event_name);
        if (!url) throw new Error("Webhook is not configured");
        const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(row.payload), signal: AbortSignal.timeout(3000), cache: "no-store" });
        if (!response.ok) throw new Error(`Zapier HTTP ${response.status}`);
        state = "accepted_by_zapier";
        totals.accepted++;
      } catch {
        // Never log the destination URL or the student's matching data.
        lastError = "Zapier delivery failed; retry scheduled";
        totals.retrying++;
      }
    }
    const result = await supabaseAdmin().from("marketing_conversion_events").update({
      status: state, lease_expires_at: null, next_attempt_at: retryAt(row.attempts, new Date()),
      accepted_at: state === "accepted_by_zapier" ? new Date().toISOString() : null, last_error: lastError,
    }).eq("event_id", row.event_id).eq("attempts", row.attempts).eq("status", "sending");
    if (result.error) reportServerError("marketing.conversion.delivery_state_failed", { code: result.error.code }, { provider: "supabase" });
  }
  if (totals.retrying || totals.expired) reportServerEvent("marketing.conversion.delivery_attention", { provider: "zapier", reason: JSON.stringify(totals) });
  return totals;
}
