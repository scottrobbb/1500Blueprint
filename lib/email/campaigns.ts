import "server-only";

import type { WeeklyCall } from "@/lib/calls/types";
import { CANONICAL_APP_URL } from "@/lib/auth/config";
import { getWeeklyCallById, listPublishedWeeklyCalls } from "@/lib/calls/queries";
import { googleCalendarTemplateUrl } from "@/lib/calls/google";
import { reportServerError } from "@/lib/observability/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { resendManagementClient } from "./client";
import { emailFromHeader, emailPhysicalAddress, emailReplyTo, resendBroadcastConfig } from "./config";
import { emailRetryDelayMs, liveCallReminderTime, shouldQueueLiveCallReminder } from "./policy";
import { liveCallReminderEmail } from "./templates";

export type LiveCallEmailState = {
  status: "not_scheduled" | "pending" | "scheduled" | "sent" | "cancelled" | "failed";
  scheduledFor: string | null;
};

type CampaignRow = {
  id: string;
  call_id: string;
  status: string;
  version: number;
  resend_broadcast_id: string | null;
  resend_broadcast_version: number | null;
  scheduled_for: string;
  attempts: number;
};

export async function queueLiveCallEmail(
  call: WeeklyCall,
  createdBy: string,
  now = new Date(),
): Promise<LiveCallEmailState> {
  if (!shouldQueueLiveCallReminder(call, now)) {
    const existing = await campaignForCall(call.id);
    if (!existing) return { status: "not_scheduled", scheduledFor: null };
    const status = existing.resend_broadcast_id ? "cancelling" : "cancelled";
    const update = await supabaseAdmin().from("email_campaigns").update({
      status,
      next_attempt_at: now.toISOString(),
      last_error_code: null,
      updated_at: now.toISOString(),
    }).eq("id", existing.id);
    if (update.error) throw new Error(`failed to cancel live-call email: ${update.error.message}`);
    return { status: "cancelled", scheduledFor: null };
  }

  const scheduledFor = liveCallReminderTime(call.startsAt, now);
  if (!scheduledFor) return { status: "not_scheduled", scheduledFor: null };
  const existing = await campaignForCall(call.id);
  if (existing?.status === "sent") {
    return { status: "sent", scheduledFor: existing.scheduled_for };
  }

  const payload = {
    kind: "live_call_reminder",
    call_id: call.id,
    status: "pending",
    version: (existing?.version ?? 0) + 1,
    scheduled_for: scheduledFor.toISOString(),
    next_attempt_at: now.toISOString(),
    last_error_code: null,
    created_by: createdBy.trim().toLowerCase(),
    updated_at: now.toISOString(),
  };
  const result = existing
    ? await supabaseAdmin().from("email_campaigns").update(payload).eq("id", existing.id)
    : await supabaseAdmin().from("email_campaigns").insert(payload);
  if (result.error) throw new Error(`failed to queue live-call email: ${result.error.message}`);
  return { status: "pending", scheduledFor: scheduledFor.toISOString() };
}

export async function queueMissingLiveCallEmails(now = new Date()): Promise<number> {
  const calls = await listPublishedWeeklyCalls();
  let queued = 0;
  for (const call of calls) {
    if (!shouldQueueLiveCallReminder(call, now) || await campaignForCall(call.id)) continue;
    await queueLiveCallEmail(call, call.createdBy, now);
    queued += 1;
  }
  return queued;
}

export async function processPendingEmailCampaigns(limit = 10): Promise<number> {
  const now = new Date();
  const stale = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const result = await supabaseAdmin()
    .from("email_campaigns")
    .select("id,call_id,status,version,resend_broadcast_id,resend_broadcast_version,scheduled_for,attempts")
    .or(`and(status.in.(pending,failed,cancelling),next_attempt_at.lte.${now.toISOString()}),and(status.eq.processing,processing_started_at.lt.${stale})`)
    .order("next_attempt_at")
    .limit(Math.max(1, Math.min(limit, 25)))
    .returns<CampaignRow[]>();
  if (result.error) throw new Error(`failed to load email campaigns: ${result.error.message}`);

  let processed = 0;
  for (const candidate of result.data ?? []) {
    const claimed = await supabaseAdmin().from("email_campaigns").update({
      status: candidate.status === "cancelling" ? "cancelling" : "processing",
      processing_started_at: now.toISOString(),
      attempts: candidate.attempts + 1,
      updated_at: now.toISOString(),
    }).eq("id", candidate.id).eq("status", candidate.status).eq("version", candidate.version).select("id").maybeSingle<{ id: string }>();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) continue;
    await processCampaign({ ...candidate, attempts: candidate.attempts + 1 });
    processed += 1;
  }
  return processed;
}

export async function cancelLiveCallEmailBeforeDelete(callId: string): Promise<void> {
  const campaign = await campaignForCall(callId);
  if (!campaign?.resend_broadcast_id || campaign.status === "sent") return;
  const remote = await resendManagementClient().broadcasts.get(campaign.resend_broadcast_id);
  if (remote.error && remote.error.statusCode !== 404) throw remote.error;
  if (remote.data && remote.data.status !== "sent") {
    const removed = await resendManagementClient().broadcasts.remove(campaign.resend_broadcast_id);
    if (removed.error && removed.error.statusCode !== 404) throw removed.error;
  }
  const update = await supabaseAdmin().from("email_campaigns").update({
    status: remote.data?.status === "sent" ? "sent" : "cancelled",
    processing_started_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", campaign.id);
  if (update.error) throw update.error;
}

async function processCampaign(campaign: CampaignRow): Promise<void> {
  try {
    if (campaign.status === "cancelling") {
      await removeRemoteBroadcast(campaign.resend_broadcast_id);
      await finishCampaign(campaign.id, campaign.version, { status: "cancelled", resend_broadcast_id: null, resend_broadcast_version: null });
      return;
    }

    const call = await getWeeklyCallById(campaign.call_id);
    if (!call || !shouldQueueLiveCallReminder(call)) {
      await removeRemoteBroadcast(campaign.resend_broadcast_id);
      await finishCampaign(campaign.id, campaign.version, { status: "cancelled", resend_broadcast_id: null, resend_broadcast_version: null });
      return;
    }
    const scheduledFor = liveCallReminderTime(call.startsAt);
    if (!scheduledFor) throw new Error("Live call is no longer schedulable");
    const config = resendBroadcastConfig();
    if (!config) throw new Error("Resend broadcast configuration is incomplete");
    const replyTo = emailReplyTo();
    if (!replyTo || !emailPhysicalAddress()) {
      throw new Error("Broadcast reply-to and mailing address are required");
    }

    if (campaign.resend_broadcast_id) {
      const remote = await resendManagementClient().broadcasts.get(campaign.resend_broadcast_id);
      if (remote.data?.status === "sent") {
        await finishCampaign(campaign.id, campaign.version, { status: "sent" });
        return;
      }
      if (remote.error && remote.error.statusCode !== 404) throw remote.error;
      if (remote.data && campaign.resend_broadcast_version === campaign.version) {
        if (remote.data.status === "queued") {
          await finishCampaign(campaign.id, campaign.version, { status: "scheduled" });
          return;
        }
        const sent = await resendManagementClient().broadcasts.send(campaign.resend_broadcast_id, {
          scheduledAt: scheduledFor.toISOString(),
        });
        if (sent.error) throw sent.error;
        await finishCampaign(campaign.id, campaign.version, { status: "scheduled", scheduled_for: scheduledFor.toISOString() });
        return;
      }
      if (remote.data) await removeRemoteBroadcast(campaign.resend_broadcast_id);
    }

    const callsUrl = `${CANONICAL_APP_URL}/ultimate/live-calls`;
    const calendarUrl = googleCalendarTemplateUrl(call);
    const message = liveCallReminderEmail(call, callsUrl, calendarUrl);
    const created = await resendManagementClient().broadcasts.create({
      segmentId: config.segmentId,
      topicId: config.topicId,
      name: `Live call reminder · ${call.id} · v${campaign.version}`,
      from: emailFromHeader(),
      replyTo,
      subject: message.subject,
      previewText: `${call.title} is coming up.`,
      html: message.html,
      text: message.text,
      send: false,
    });
    if (created.error || !created.data) throw created.error ?? new Error("Resend did not create the broadcast");
    const savedDraft = await supabaseAdmin().from("email_campaigns").update({
      status: "processing",
      resend_broadcast_id: created.data.id,
      resend_broadcast_version: campaign.version,
      scheduled_for: scheduledFor.toISOString(),
      last_error_code: null,
      processing_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", campaign.id).eq("version", campaign.version).select("id").maybeSingle<{ id: string }>();
    if (savedDraft.error) throw savedDraft.error;
    if (!savedDraft.data) {
      await removeRemoteBroadcast(created.data.id);
      return;
    }
    const sent = await resendManagementClient().broadcasts.send(created.data.id, {
      scheduledAt: scheduledFor.toISOString(),
    });
    if (sent.error) throw sent.error;
    await finishCampaign(campaign.id, campaign.version, {
      status: "scheduled",
      last_error_code: null,
    });
  } catch (error) {
    const nextAttempt = new Date(Date.now() + emailRetryDelayMs(campaign.attempts)).toISOString();
    const update = await supabaseAdmin().from("email_campaigns").update({
      status: "failed",
      processing_started_at: null,
      next_attempt_at: nextAttempt,
      last_error_code: errorCode(error),
      updated_at: new Date().toISOString(),
    }).eq("id", campaign.id).eq("version", campaign.version);
    if (update.error) reportServerError("email.campaign.state_failed", update.error, { provider: "supabase", source: "processCampaign" });
    reportServerError("email.campaign.schedule_failed", error, { provider: "resend", source: "live_call_reminder" });
  }
}

async function removeRemoteBroadcast(id: string | null): Promise<void> {
  if (!id) return;
  const remote = await resendManagementClient().broadcasts.get(id);
  if (remote.error && remote.error.statusCode !== 404) throw remote.error;
  if (!remote.data || remote.data.status === "sent") return;
  const removed = await resendManagementClient().broadcasts.remove(id);
  if (removed.error && removed.error.statusCode !== 404) throw removed.error;
}

async function campaignForCall(callId: string): Promise<CampaignRow | null> {
  const result = await supabaseAdmin()
    .from("email_campaigns")
    .select("id,call_id,status,version,resend_broadcast_id,resend_broadcast_version,scheduled_for,attempts")
    .eq("kind", "live_call_reminder")
    .eq("call_id", callId)
    .maybeSingle<CampaignRow>();
  if (result.error?.code === "42P01" || result.error?.code === "PGRST205") return null;
  if (result.error) throw new Error(`failed to load live-call email: ${result.error.message}`);
  return result.data;
}

async function finishCampaign(id: string, version: number, update: Record<string, unknown>): Promise<void> {
  const result = await supabaseAdmin().from("email_campaigns").update({
    ...update,
    processing_started_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("version", version);
  if (result.error) throw result.error;
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown_error";
  const candidate = error as { name?: unknown; statusCode?: unknown };
  if (typeof candidate.name === "string" && /^[a-z0-9_-]{1,80}$/i.test(candidate.name)) return candidate.name;
  return typeof candidate.statusCode === "number" ? `http_${candidate.statusCode}` : "unknown_error";
}
