import assert from "node:assert/strict";
import test from "node:test";
import { parseWeeklyCallInput } from "./input";

test("normalizes a valid weekly call payload", () => {
  const call = parseWeeklyCallInput({
    title: "  Weekly Math Call  ",
    description: "Bring two questions.",
    focusTopic: "Advanced Math",
    hostName: "Scott Robinson",
    startsAt: "2026-09-05T15:00:00-04:00",
    endsAt: "2026-09-05T16:00:00-04:00",
    timezone: "America/New_York",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    recordingUrl: "",
    status: "published",
  });
  assert.equal(call?.title, "Weekly Math Call");
  assert.equal(call?.startsAt, "2026-09-05T19:00:00.000Z");
  assert.equal(call?.meetingUrl, "https://meet.google.com/abc-defg-hij");
  assert.equal(call?.recordingUrl, null);
});

test("rejects invalid weekly call ranges, statuses, and links", () => {
  const base = {
    title: "Weekly Call",
    hostName: "Scott",
    startsAt: "2026-09-05T16:00:00Z",
    endsAt: "2026-09-05T15:00:00Z",
    timezone: "America/New_York",
    status: "published",
  };
  assert.equal(parseWeeklyCallInput(base), null);
  assert.equal(parseWeeklyCallInput({ ...base, endsAt: "2026-09-05T17:00:00Z", status: "public" }), null);
  assert.equal(parseWeeklyCallInput({ ...base, endsAt: "2026-09-05T17:00:00Z", meetingUrl: "javascript:alert(1)" }), null);
});
