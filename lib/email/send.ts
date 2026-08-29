import "server-only";

import type { CreateEmailOptions, ErrorResponse } from "resend";
import { reportServerError } from "@/lib/observability/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { emailFromHeader, emailReplyTo } from "./config";
import { resendClient } from "./client";
import { retryableResendError } from "./policy";
import type { RenderedEmail } from "./templates";

export type EmailKind = "magic_link" | "signup_verification" | "password_reset" | "welcome";

type SendTrackedEmailInput = {
  kind: EmailKind;
  to: string;
  userId?: string | null;
  idempotencyKey: string;
  message: RenderedEmail;
};

type SendAttempt = {
  data: { id: string } | null;
  error: ErrorResponse | null;
};

export class EmailDeliveryError extends Error {
  constructor(readonly code: string) {
    super("Email delivery failed");
    this.name = "EmailDeliveryError";
  }
}

export async function sendTrackedEmail(input: SendTrackedEmailInput): Promise<string> {
  const normalizedEmail = input.to.trim().toLowerCase();
  if (await hasPermanentDeliveryBlock(normalizedEmail)) {
    throw new EmailDeliveryError("recipient_suppressed");
  }

  const existing = await existingMessage(input.idempotencyKey);
  if (existing?.resend_email_id && ["sent", "delivered", "scheduled"].includes(existing.status)) {
    return existing.resend_email_id;
  }

  const messageId = existing?.id ?? crypto.randomUUID();
  if (!existing) await createMessage(messageId, input, normalizedEmail);

  const payload: CreateEmailOptions = {
    from: emailFromHeader(),
    to: [normalizedEmail],
    subject: input.message.subject,
    html: input.message.html,
    text: input.message.text,
    replyTo: emailReplyTo(),
    tags: [{ name: "email_type", value: input.kind }],
  };

  try {
    const sent = await sendEmailWithRetry(
      () => resendClient().emails.send(payload, { idempotencyKey: input.idempotencyKey }),
      wait,
    );
    await updateMessage(messageId, {
      resend_email_id: sent.id,
      status: "sent",
      sent_at: new Date().toISOString(),
      last_error_code: null,
    });
    return sent.id;
  } catch (error) {
    const code = resendErrorCode(error);
    await updateMessage(messageId, { status: "failed", last_error_code: code });
    reportServerError("email.send.failed", error, {
      provider: "resend",
      source: input.kind,
    });
    throw error instanceof EmailDeliveryError ? error : new EmailDeliveryError(code);
  }
}

export async function sendEmailWithRetry(
  send: () => Promise<SendAttempt>,
  sleep: (milliseconds: number) => Promise<void>,
  maxRetries = 3,
): Promise<{ id: string }> {
  let lastError: ErrorResponse | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await send();
      if (result.data && !result.error) return result.data;
      lastError = result.error;
      if (!result.error || !retryableResendError(result.error) || attempt === maxRetries) {
        throw new EmailDeliveryError(resendErrorCode(result.error));
      }
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      if (attempt === maxRetries) throw new EmailDeliveryError(resendErrorCode(error));
    }
    await sleep(2 ** attempt * 1000);
  }
  throw new EmailDeliveryError(resendErrorCode(lastError));
}

type MessageRow = { id: string; resend_email_id: string | null; status: string };

async function existingMessage(idempotencyKey: string): Promise<MessageRow | null> {
  const result = await supabaseAdmin()
    .from("email_messages")
    .select("id,resend_email_id,status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<MessageRow>();
  if (result.error) {
    reportServerError("email.tracking.lookup_failed", result.error, { provider: "supabase", source: "sendTrackedEmail" });
    return null;
  }
  return result.data;
}

async function hasPermanentDeliveryBlock(email: string): Promise<boolean> {
  const result = await supabaseAdmin()
    .from("email_contacts")
    .select("delivery_status")
    .eq("email", email)
    .maybeSingle<{ delivery_status: string }>();
  if (result.error) return false;
  return Boolean(result.data && result.data.delivery_status !== "active");
}

async function createMessage(
  id: string,
  input: SendTrackedEmailInput,
  recipientEmail: string,
): Promise<void> {
  const result = await supabaseAdmin().from("email_messages").insert({
    id,
    kind: input.kind,
    recipient_email: recipientEmail,
    idempotency_key: input.idempotencyKey,
    status: "queued",
  });
  if (result.error && result.error.code !== "23505") {
    reportServerError("email.tracking.create_failed", result.error, { provider: "supabase", source: input.kind });
  }
}

async function updateMessage(id: string, update: Record<string, unknown>): Promise<void> {
  const result = await supabaseAdmin()
    .from("email_messages")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (result.error) {
    reportServerError("email.tracking.update_failed", result.error, { provider: "supabase", source: "sendTrackedEmail" });
  }
}

function resendErrorCode(error: unknown): string {
  if (error instanceof EmailDeliveryError) return error.code;
  if (!error || typeof error !== "object") return "unknown_error";
  const candidate = error as { name?: unknown; statusCode?: unknown };
  if (typeof candidate.name === "string" && /^[a-z0-9_-]{1,80}$/i.test(candidate.name)) return candidate.name;
  return typeof candidate.statusCode === "number" ? `http_${candidate.statusCode}` : "unknown_error";
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
