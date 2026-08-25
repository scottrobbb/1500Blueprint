import type { WeeklyCallInput, WeeklyCallStatus } from "./types";

export function parseWeeklyCallInput(value: unknown): WeeklyCallInput | null {
  if (!isRecord(value)) return null;
  const title = string(value.title, 160);
  const hostName = string(value.hostName, 120) || "Scott Robinson";
  const description = optionalString(value.description, 5_000);
  const focusTopic = optionalString(value.focusTopic, 240);
  const timezone = string(value.timezone, 100) || "America/New_York";
  const startsAt = isoDate(value.startsAt);
  const endsAt = isoDate(value.endsAt);
  const meetingUrl = optionalUrl(value.meetingUrl);
  const recordingUrl = optionalUrl(value.recordingUrl);
  const status = callStatus(value.status);
  if (!title || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt) || !status) return null;
  if (value.meetingUrl && meetingUrl === null) return null;
  if (value.recordingUrl && recordingUrl === null) return null;
  return { title, description, focusTopic, hostName, startsAt, endsAt, timezone, meetingUrl, recordingUrl, status };
}

function string(value: unknown, max: number): string {
  return typeof value === "string" && value.trim().length <= max ? value.trim() : "";
}

function optionalString(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && value.trim().length <= max ? value.trim() : null;
}

function optionalUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function callStatus(value: unknown): WeeklyCallStatus | null {
  return value === "draft" || value === "published" || value === "cancelled" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
