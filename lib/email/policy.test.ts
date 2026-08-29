import assert from "node:assert/strict";
import test from "node:test";
import {
  emailRetryDelayMs,
  eventStatus,
  liveCallReminderTime,
  retryableResendError,
  shouldQueueLiveCallReminder,
} from "./policy";

test("live-call reminders schedule 24 hours before the session", () => {
  const now = new Date("2026-08-29T12:00:00.000Z");
  assert.equal(
    liveCallReminderTime("2026-09-02T15:00:00.000Z", now)?.toISOString(),
    "2026-09-01T15:00:00.000Z",
  );
});

test("short-notice calls schedule two minutes ahead and past calls do not schedule", () => {
  const now = new Date("2026-08-29T12:00:00.000Z");
  assert.equal(
    liveCallReminderTime("2026-08-29T13:00:00.000Z", now)?.toISOString(),
    "2026-08-29T12:02:00.000Z",
  );
  assert.equal(liveCallReminderTime("2026-08-29T11:00:00.000Z", now), null);
  assert.equal(liveCallReminderTime("2026-08-29T12:01:00.000Z", now), null);
});

test("only future published calls queue reminders", () => {
  const now = new Date("2026-08-29T12:00:00.000Z");
  assert.equal(shouldQueueLiveCallReminder({ status: "published", startsAt: "2026-08-30T12:00:00.000Z" }, now), true);
  assert.equal(shouldQueueLiveCallReminder({ status: "draft", startsAt: "2026-08-30T12:00:00.000Z" }, now), false);
  assert.equal(shouldQueueLiveCallReminder({ status: "cancelled", startsAt: "2026-08-30T12:00:00.000Z" }, now), false);
});

test("Resend retries only transient provider failures with bounded backoff", () => {
  assert.equal(retryableResendError({ name: "rate_limit_exceeded", statusCode: 429 }), true);
  assert.equal(retryableResendError({ name: "api_error", statusCode: 500 }), true);
  assert.equal(retryableResendError({ name: "validation_error", statusCode: 400 }), false);
  assert.equal(emailRetryDelayMs(1), 60_000);
  assert.equal(emailRetryDelayMs(20), 3_600_000);
});

test("webhook event names map to durable message states", () => {
  assert.equal(eventStatus("email.delivered"), "delivered");
  assert.equal(eventStatus("email.delivery_delayed"), "delivery_delayed");
  assert.equal(eventStatus("email.opened"), null);
});
