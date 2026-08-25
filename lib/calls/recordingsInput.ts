import type { CallRecordingLessonInput, CallRecordingMonthInput, RecordingLessonStatus } from "./types";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseRecordingMonthInput(value: unknown): CallRecordingMonthInput | null {
  if (!isRecord(value)) return null;
  const rawMonth = typeof value.monthDate === "string" ? value.monthDate.trim() : "";
  if (!MONTH_PATTERN.test(rawMonth)) return null;
  const monthDate = `${rawMonth}-01`;
  const label = optionalString(value.label, 80) ?? defaultLabel(monthDate);
  return { monthDate, label };
}

export function parseRecordingLessonInput(value: unknown): CallRecordingLessonInput | null {
  if (!isRecord(value)) return null;
  const monthId = string(value.monthId, 160);
  const title = string(value.title, 160);
  const vimeoUrl = vimeoLink(value.vimeoUrl);
  const status = recordingStatus(value.status);
  if (!monthId || !title || !vimeoUrl || !status) return null;
  return { monthId, title, vimeoUrl, status };
}

function vimeoLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    if (!url.hostname.endsWith("vimeo.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function recordingStatus(value: unknown): RecordingLessonStatus | null {
  return value === "draft" || value === "published" ? value : null;
}

function defaultLabel(monthDate: string): string {
  return new Date(`${monthDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function string(value: unknown, max: number): string {
  return typeof value === "string" && value.trim().length <= max ? value.trim() : "";
}

function optionalString(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && value.trim().length <= max ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
