import assert from "node:assert/strict";
import test from "node:test";
import type { WeeklyCall } from "@/lib/calls/types";
import { authLinkEmail, liveCallReminderEmail, welcomeEmail } from "./templates";

test("auth emails include HTML, plain text, preview copy, and escaped links", () => {
  const email = authLinkEmail({
    subject: "Verify",
    preview: "Preview",
    heading: "Verify your email",
    introduction: "Continue securely.",
    buttonLabel: "Verify",
    url: "https://example.com/confirm?a=1&b=2",
    securityNote: "Ignore this if it was not you.",
  });
  assert.match(email.html, /<!doctype html>/i);
  assert.match(email.html, /https:\/\/example\.com\/confirm\?a=1&amp;b=2/);
  assert.match(email.text, /Continue securely/);
});

test("welcome email links to the student workspace", () => {
  const email = welcomeEmail("Han", "https://www.1500satblueprint.com/ultimate");
  assert.match(email.subject, /Welcome/);
  assert.match(email.html, /Welcome, Han/);
  assert.match(email.text, /\/ultimate/);
});

test("live-call broadcast is personalized, unsubscribe-aware, and escapes call content", () => {
  const email = liveCallReminderEmail(
    weeklyCall({ title: "Algebra <script>", focusTopic: "Functions & graphs" }),
    "https://www.1500satblueprint.com/ultimate/live-calls",
    "https://calendar.google.com/calendar/render?action=TEMPLATE",
  );
  assert.match(email.html, /\{\{\{contact\.first_name\|there\}\}\}/);
  assert.match(email.html, /\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
  assert.match(email.html, /Algebra &lt;script&gt;/);
  assert.doesNotMatch(email.html, /Algebra <script>/);
  assert.match(email.text, /Add to Google Calendar/);
});

function weeklyCall(overrides: Partial<WeeklyCall> = {}): WeeklyCall {
  return {
    id: "call-1",
    title: "Weekly SAT strategy call",
    description: "Bring your latest test.",
    focusTopic: null,
    hostName: "Scott Robinson",
    startsAt: "2026-09-05T15:00:00.000Z",
    endsAt: "2026-09-05T16:00:00.000Z",
    timezone: "America/New_York",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    recordingUrl: null,
    googleEventId: null,
    googleCalendarUrl: null,
    status: "published",
    createdBy: "scott@example.com",
    createdAt: "2026-08-29T12:00:00.000Z",
    updatedAt: "2026-08-29T12:00:00.000Z",
    ...overrides,
  };
}
