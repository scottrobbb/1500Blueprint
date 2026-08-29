import "server-only";

import { SignJWT, importPKCS8 } from "jose";
import type { WeeklyCall, WeeklyCallInput } from "./types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

type GoogleEvent = {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
};

export type GoogleCalendarSync = {
  configured: boolean;
  eventId: string | null;
  calendarUrl: string | null;
  meetingUrl: string | null;
};

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_ID?.trim()
    && process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL?.trim()
    && process.env.GOOGLE_CALENDAR_PRIVATE_KEY?.trim(),
  );
}

export async function syncGoogleCalendarEvent(
  call: Pick<WeeklyCall, "id" | "googleEventId"> & WeeklyCallInput,
): Promise<GoogleCalendarSync> {
  if (!isGoogleCalendarConfigured()) {
    return { configured: false, eventId: call.googleEventId, calendarUrl: null, meetingUrl: call.meetingUrl };
  }
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() as string;
  const token = await accessToken();
  const payload = {
    summary: call.title,
    description: calendarDescription(call),
    start: { dateTime: call.startsAt, timeZone: call.timezone },
    end: { dateTime: call.endsAt, timeZone: call.timezone },
    ...(call.meetingUrl ? { location: call.meetingUrl } : {}),
    ...(process.env.GOOGLE_CALENDAR_CREATE_MEET === "false" || call.meetingUrl
      ? {}
      : { conferenceData: { createRequest: { requestId: `blueprint-${call.id}-${Date.now()}` } } }),
  };
  const query = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: "none" });
  const eventPath = call.googleEventId ? `/${encodeURIComponent(call.googleEventId)}` : "";
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventPath}?${query}`,
    {
      method: call.googleEventId ? "PATCH" : "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  const body = (await response.json().catch(() => null)) as GoogleEvent & { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? "Google Calendar rejected the event.");
  const meetingUrl = body?.hangoutLink
    ?? body?.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri
    ?? call.meetingUrl;
  return {
    configured: true,
    eventId: body?.id ?? call.googleEventId,
    calendarUrl: body?.htmlLink ?? null,
    meetingUrl: meetingUrl ?? null,
  };
}

export async function deleteGoogleCalendarEvent(eventId: string | null): Promise<void> {
  if (!eventId || !isGoogleCalendarConfigured()) return;
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() as string;
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "DELETE", headers: { authorization: `Bearer ${await accessToken()}` }, cache: "no-store" },
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error("Google Calendar could not remove the event.");
  }
}

export function googleCalendarTemplateUrl(call: Pick<WeeklyCall, "title" | "description" | "startsAt" | "endsAt" | "meetingUrl">): string {
  const dates = `${calendarStamp(call.startsAt)}/${calendarStamp(call.endsAt)}`;
  const details = [call.description, call.meetingUrl ? `Join: ${call.meetingUrl}` : null].filter(Boolean).join("\n\n");
  const params = new URLSearchParams({ action: "TEMPLATE", text: call.title, dates, details });
  if (call.meetingUrl) params.set("location", call.meetingUrl);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function accessToken(): Promise<string> {
  const email = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_CALENDAR_PRIVATE_KEY?.trim();
  if (!email || !rawKey) throw new Error("Google Calendar credentials are incomplete.");
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  let assertion = new SignJWT({ scope: CALENDAR_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600);
  const impersonatedUser = process.env.GOOGLE_CALENDAR_IMPERSONATE_USER?.trim();
  if (impersonatedUser) assertion = assertion.setSubject(impersonatedUser);
  const jwt = await assertion.sign(await importPKCS8(privateKey, "RS256"));
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string; error_description?: string } | null;
  if (!response.ok || !body?.access_token) throw new Error(body?.error_description ?? "Google Calendar authentication failed.");
  return body.access_token;
}

function calendarDescription(call: WeeklyCallInput): string {
  return [call.description, call.focusTopic ? `Focus: ${call.focusTopic}` : null, "Scheduled through 1500 Blueprint."].filter(Boolean).join("\n\n");
}

function calendarStamp(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
