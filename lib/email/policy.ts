import type { WeeklyCall } from "@/lib/calls/types";

const MINIMUM_SCHEDULING_LEAD_MS = 2 * 60 * 1000;
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export function liveCallReminderTime(
  startsAt: string,
  now = new Date(),
): Date | null {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start) || start <= now.getTime()) return null;
  const earliest = now.getTime() + MINIMUM_SCHEDULING_LEAD_MS;
  if (earliest >= start) return null;
  return new Date(Math.max(start - REMINDER_LEAD_MS, earliest));
}

export function shouldQueueLiveCallReminder(
  call: Pick<WeeklyCall, "status" | "startsAt">,
  now = new Date(),
): boolean {
  return call.status === "published" && liveCallReminderTime(call.startsAt, now) !== null;
}

export function emailRetryDelayMs(attempt: number): number {
  return Math.min(60 * 60 * 1000, 2 ** Math.max(0, attempt - 1) * 60 * 1000);
}

export function retryableResendError(error: { name?: string; statusCode?: number | null }): boolean {
  return error.name === "rate_limit_exceeded"
    || error.name === "api_error"
    || error.statusCode === 429
    || Boolean(error.statusCode && error.statusCode >= 500);
}

export function eventStatus(type: string): string | null {
  const statuses: Record<string, string> = {
    "email.scheduled": "scheduled",
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
    "email.suppressed": "suppressed",
  };
  return statuses[type] ?? null;
}
