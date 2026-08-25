import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import { deleteGoogleCalendarEvent, isGoogleCalendarConfigured, syncGoogleCalendarEvent, type GoogleCalendarSync } from "./google";
import type { WeeklyCall, WeeklyCallInput, WeeklyCallStatus } from "./types";

type WeeklyCallRow = {
  id: string;
  title: string;
  description: string | null;
  focus_topic: string | null;
  host_name: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  meeting_url: string | null;
  recording_url: string | null;
  google_event_id: string | null;
  google_calendar_url: string | null;
  status: WeeklyCallStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id,title,description,focus_topic,host_name,starts_at,ends_at,timezone,meeting_url,recording_url,google_event_id,google_calendar_url,status,created_by,created_at,updated_at";

export async function listPublishedWeeklyCalls(): Promise<WeeklyCall[]> {
  const { data, error } = await supabaseAdmin().from("weekly_calls").select(COLUMNS).eq("status", "published").order("starts_at").returns<WeeklyCallRow[]>();
  if (error) throw new Error(`failed to load weekly calls: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function getPublishedWeeklyCallSchedule(): Promise<{
  upcoming: WeeklyCall[];
  recordings: WeeklyCall[];
}> {
  const calls = await listPublishedWeeklyCalls();
  const now = Date.now();
  return {
    upcoming: calls
      .filter((call) => Date.parse(call.endsAt) >= now)
      .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
    recordings: calls
      .filter((call) => Date.parse(call.endsAt) < now && call.recordingUrl)
      .sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt)),
  };
}

export async function listAllWeeklyCalls(): Promise<WeeklyCall[]> {
  const { data, error } = await supabaseAdmin().from("weekly_calls").select(COLUMNS).order("starts_at", { ascending: false }).returns<WeeklyCallRow[]>();
  if (error) throw new Error(`failed to load admin weekly calls: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function createWeeklyCall(input: WeeklyCallInput, createdBy: string): Promise<{ call: WeeklyCall; sync: GoogleCalendarSync; warning?: string }> {
  const id = crypto.randomUUID();
  const { data, error } = await supabaseAdmin().from("weekly_calls").insert(toRow(id, input, createdBy)).select(COLUMNS).single<WeeklyCallRow>();
  if (error || !data) throw new Error(`failed to create weekly call: ${error?.message ?? "No call returned"}`);
  return syncAndPersist(fromRow(data));
}

export async function updateWeeklyCall(id: string, input: WeeklyCallInput): Promise<{ call: WeeklyCall; sync: GoogleCalendarSync; warning?: string }> {
  const { data, error } = await supabaseAdmin().from("weekly_calls").update({ ...toMutableRow(input), updated_at: new Date().toISOString() }).eq("id", id).select(COLUMNS).maybeSingle<WeeklyCallRow>();
  if (error || !data) throw new Error(`failed to update weekly call: ${error?.message ?? "Call not found"}`);
  return syncAndPersist(fromRow(data));
}

export async function deleteWeeklyCall(id: string): Promise<void> {
  const existing = await supabaseAdmin().from("weekly_calls").select("google_event_id").eq("id", id).maybeSingle<{ google_event_id: string | null }>();
  if (existing.error) throw new Error(`failed to load weekly call: ${existing.error.message}`);
  await deleteGoogleCalendarEvent(existing.data?.google_event_id ?? null);
  const { error } = await supabaseAdmin().from("weekly_calls").delete().eq("id", id);
  if (error) throw new Error(`failed to delete weekly call: ${error.message}`);
}

async function syncAndPersist(call: WeeklyCall): Promise<{ call: WeeklyCall; sync: GoogleCalendarSync; warning?: string }> {
  try {
    if (call.status !== "published") {
      await deleteGoogleCalendarEvent(call.googleEventId);
      const update = await supabaseAdmin().from("weekly_calls").update({
        google_event_id: null,
        google_calendar_url: null,
        updated_at: new Date().toISOString(),
      }).eq("id", call.id).select(COLUMNS).single<WeeklyCallRow>();
      if (update.error || !update.data) throw new Error(update.error?.message ?? "Unpublished call was not persisted.");
      return {
        call: fromRow(update.data),
        sync: { configured: isGoogleCalendarConfigured(), eventId: null, calendarUrl: null, meetingUrl: call.meetingUrl },
      };
    }
    const sync = await syncGoogleCalendarEvent(call);
    if (!sync.configured) return { call, sync };
    const update = await supabaseAdmin().from("weekly_calls").update({
      google_event_id: sync.eventId,
      google_calendar_url: sync.calendarUrl,
      meeting_url: sync.meetingUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", call.id).select(COLUMNS).single<WeeklyCallRow>();
    if (update.error || !update.data) throw new Error(update.error?.message ?? "Calendar sync was not persisted.");
    return { call: fromRow(update.data), sync };
  } catch (error) {
    return {
      call,
      sync: { configured: true, eventId: call.googleEventId, calendarUrl: call.googleCalendarUrl, meetingUrl: call.meetingUrl },
      warning: error instanceof Error ? error.message : "Google Calendar sync failed.",
    };
  }
}

function fromRow(row: WeeklyCallRow): WeeklyCall {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    focusTopic: row.focus_topic,
    hostName: row.host_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    meetingUrl: row.meeting_url,
    recordingUrl: row.recording_url,
    googleEventId: row.google_event_id,
    googleCalendarUrl: row.google_calendar_url,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(id: string, input: WeeklyCallInput, createdBy: string) {
  return { id, ...toMutableRow(input), created_by: createdBy.trim().toLowerCase() };
}

function toMutableRow(input: WeeklyCallInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    focus_topic: input.focusTopic?.trim() || null,
    host_name: input.hostName.trim() || "Scott Robinson",
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    timezone: input.timezone.trim() || "America/New_York",
    meeting_url: input.meetingUrl?.trim() || null,
    recording_url: input.recordingUrl?.trim() || null,
    status: input.status,
  };
}
