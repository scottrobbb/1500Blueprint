import "server-only";

import type { WebhookEventPayload } from "resend";
import { reportServerError } from "@/lib/observability/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { eventStatus } from "./policy";

type EmailEvent = Exclude<
  Extract<WebhookEventPayload, { data: { email_id: string; to: string[] } }>,
  { type: "email.received" }
>;
type ContactEvent = Extract<WebhookEventPayload, { data: { email: string; unsubscribed: boolean } }>;

export async function recordResendWebhook(
  eventId: string,
  event: WebhookEventPayload,
): Promise<{ duplicate: boolean }> {
  try {
    if (isEmailEvent(event)) return await recordEmailEvent(eventId, event);
    if (isContactEvent(event)) return await recordContactEvent(eventId, event);
    const ledger = await recordEventLedger(eventId, event.type, event.created_at, null, null, null);
    if (!ledger.duplicate) await finishEvent(eventId);
    return ledger;
  } catch (error) {
    await failEvent(eventId, errorCode(error));
    throw error;
  }
}

async function recordEmailEvent(eventId: string, event: EmailEvent): Promise<{ duplicate: boolean }> {
  const recipient = event.data.to[0]?.trim().toLowerCase() || null;
  const ledger = await recordEventLedger(
    eventId,
    event.type,
    event.created_at,
    event.data.email_id,
    event.data.broadcast_id ?? null,
    recipient,
  );
  if (ledger.duplicate) return ledger;

  const status = eventStatus(event.type);
  if (status) {
    await updateMessageState({
      emailId: event.data.email_id,
      broadcastId: event.data.broadcast_id ?? null,
      recipient,
      status,
      eventCreatedAt: event.created_at,
      errorCode: eventFailureCode(event),
      kind: messageKind(event.data.tags?.email_type, Boolean(event.data.broadcast_id)),
    });
  }
  if (event.type === "email.opened" || event.type === "email.clicked") {
    await updateEngagement(event.data.email_id, event.type, event.created_at);
  }

  if (event.data.broadcast_id && (event.type === "email.sent" || event.type === "email.delivered")) {
    const update = await supabaseAdmin().from("email_campaigns").update({
      status: "sent",
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    }).eq("resend_broadcast_id", event.data.broadcast_id).neq("status", "cancelled");
    if (update.error) throw update.error;
  }

  if (recipient) await updateDeliveryHealth(recipient, event);
  await finishEvent(eventId);
  return ledger;
}

async function recordContactEvent(eventId: string, event: ContactEvent): Promise<{ duplicate: boolean }> {
  const recipient = event.data.email.trim().toLowerCase();
  const ledger = await recordEventLedger(eventId, event.type, event.created_at, null, null, recipient);
  if (ledger.duplicate) return ledger;
  const result = await supabaseAdmin().from("email_contacts").update({
    resend_contact_id: event.type === "contact.deleted" ? null : event.data.id,
    sync_status: event.type === "contact.deleted" ? "pending" : "synced",
    broadcast_unsubscribed: event.type === "contact.deleted" ? false : event.data.unsubscribed,
    last_event_at: event.created_at,
    updated_at: new Date().toISOString(),
  }).eq("email", recipient);
  if (result.error) throw result.error;
  await finishEvent(eventId);
  return ledger;
}

async function updateMessageState(input: {
  emailId: string;
  broadcastId: string | null;
  recipient: string | null;
  status: string;
  eventCreatedAt: string;
  errorCode: string | null;
  kind: string;
}): Promise<void> {
  const db = supabaseAdmin();
  const existing = await db.from("email_messages")
    .select("id,last_event_at")
    .eq("resend_email_id", input.emailId)
    .maybeSingle<{ id: string; last_event_at: string | null }>();
  if (existing.error) {
    throw existing.error;
  }
  if (existing.data?.last_event_at && Date.parse(existing.data.last_event_at) > Date.parse(input.eventCreatedAt)) return;

  const campaign = input.broadcastId
    ? await db.from("email_campaigns").select("id").eq("resend_broadcast_id", input.broadcastId).maybeSingle<{ id: string }>()
    : { data: null, error: null };
  if (campaign.error) throw campaign.error;

  const values = {
    status: input.status,
    resend_email_id: input.emailId,
    resend_broadcast_id: input.broadcastId,
    recipient_email: input.recipient,
    campaign_id: campaign.data?.id ?? null,
    last_event_at: input.eventCreatedAt,
    last_error_code: input.errorCode,
    sent_at: input.status === "sent" ? input.eventCreatedAt : undefined,
    delivered_at: input.status === "delivered" ? input.eventCreatedAt : undefined,
    updated_at: new Date().toISOString(),
  };
  const result = existing.data
    ? await db.from("email_messages").update(values).eq("id", existing.data.id)
    : await db.from("email_messages").insert({ id: crypto.randomUUID(), kind: input.kind, ...values });
  if (result.error) throw result.error;
}

async function updateDeliveryHealth(email: string, event: EmailEvent): Promise<void> {
  let deliveryStatus: string | null = null;
  if (event.type === "email.bounced") deliveryStatus = "hard_bounced";
  if (event.type === "email.complained") deliveryStatus = "complained";
  if (event.type === "email.suppressed") deliveryStatus = "suppressed";
  const update: Record<string, unknown> = {
    last_event_at: event.created_at,
    updated_at: new Date().toISOString(),
  };
  if (deliveryStatus) {
    update.delivery_status = deliveryStatus;
    update.last_error_code = eventFailureCode(event);
  }
  const result = await supabaseAdmin().from("email_contacts").update(update).eq("email", email);
  if (result.error) throw result.error;
}

async function updateEngagement(emailId: string, type: "email.opened" | "email.clicked", createdAt: string): Promise<void> {
  const existing = await supabaseAdmin().from("email_messages")
    .select("id,opened_at,clicked_at,click_count,last_event_at")
    .eq("resend_email_id", emailId)
    .maybeSingle<{ id: string; opened_at: string | null; clicked_at: string | null; click_count: number; last_event_at: string | null }>();
  if (existing.error) throw existing.error;
  if (!existing.data) return;
  const update = type === "email.opened"
    ? { opened_at: existing.data.opened_at ?? createdAt }
    : {
        clicked_at: existing.data.clicked_at && Date.parse(existing.data.clicked_at) > Date.parse(createdAt)
          ? existing.data.clicked_at
          : createdAt,
        click_count: existing.data.click_count + 1,
      };
  const result = await supabaseAdmin().from("email_messages").update({
    ...update,
    last_event_at: existing.data.last_event_at && Date.parse(existing.data.last_event_at) > Date.parse(createdAt)
      ? existing.data.last_event_at
      : createdAt,
    updated_at: new Date().toISOString(),
  }).eq("id", existing.data.id);
  if (result.error) throw result.error;
}

async function recordEventLedger(
  eventId: string,
  type: string,
  eventCreatedAt: string,
  emailId: string | null,
  broadcastId: string | null,
  recipient: string | null,
): Promise<{ duplicate: boolean }> {
  const result = await supabaseAdmin().from("email_webhook_events").insert({
    resend_event_id: eventId,
    event_type: type,
    resend_email_id: emailId,
    resend_broadcast_id: broadcastId,
    recipient_email: recipient,
    event_created_at: eventCreatedAt,
  });
  if (!result.error) return { duplicate: false };
  if (result.error.code === "23505") {
    const existing = await supabaseAdmin().from("email_webhook_events")
      .select("attempts,processed_at")
      .eq("resend_event_id", eventId)
      .single<{ attempts: number; processed_at: string | null }>();
    if (existing.error) throw existing.error;
    if (existing.data.processed_at) return { duplicate: true };
    const retry = await supabaseAdmin().from("email_webhook_events").update({
      attempts: existing.data.attempts + 1,
      processing_error: null,
      received_at: new Date().toISOString(),
    }).eq("resend_event_id", eventId);
    if (retry.error) throw retry.error;
    return { duplicate: false };
  }
  throw new Error(`failed to record Resend webhook: ${result.error.message}`);
}

async function finishEvent(eventId: string): Promise<void> {
  const result = await supabaseAdmin().from("email_webhook_events").update({
    processed_at: new Date().toISOString(),
    processing_error: null,
  }).eq("resend_event_id", eventId);
  if (result.error) throw result.error;
}

async function failEvent(eventId: string, code: string): Promise<void> {
  const result = await supabaseAdmin().from("email_webhook_events").update({
    processing_error: code,
    processed_at: null,
  }).eq("resend_event_id", eventId);
  if (result.error) reportServerError("email.webhook.failure_state_failed", result.error, { provider: "supabase", source: "recordResendWebhook" });
}

function isEmailEvent(event: WebhookEventPayload): event is EmailEvent {
  return event.type.startsWith("email.")
    && event.type !== "email.received"
    && "email_id" in event.data
    && "to" in event.data;
}

function isContactEvent(event: WebhookEventPayload): event is ContactEvent {
  return event.type === "contact.created" || event.type === "contact.updated" || event.type === "contact.deleted";
}

function eventFailureCode(event: EmailEvent): string | null {
  if (event.type === "email.bounced") return safeCode(event.data.bounce.type);
  if (event.type === "email.failed") return safeCode(event.data.failed.reason);
  if (event.type === "email.suppressed") return safeCode(event.data.suppressed.type);
  if (event.type === "email.complained") return "complaint";
  return null;
}

function safeCode(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.slice(0, 80) || "provider_error";
}

function messageKind(value: string | undefined, broadcast: boolean): string {
  if (["magic_link", "signup_verification", "password_reset", "welcome"].includes(value ?? "")) return value as string;
  return broadcast ? "live_call_reminder" : "magic_link";
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown_error";
  const candidate = error as { name?: unknown; code?: unknown };
  const value = typeof candidate.code === "string" ? candidate.code : candidate.name;
  return typeof value === "string" && /^[a-z0-9_-]{1,80}$/i.test(value) ? value : "unknown_error";
}
