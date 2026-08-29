import assert from "node:assert/strict";
import test from "node:test";
import { emailFromHeader, emailReplyTo, resendBroadcastConfig } from "./config";

test("email sender stays on the verified Blueprint domain", () => {
  withEnvironment({ EMAIL_FROM: "Scott <login@1500satblueprint.com>" }, () => {
    assert.equal(emailFromHeader(), "Scott <login@1500satblueprint.com>");
  });
  withEnvironment({ EMAIL_FROM: "Attacker <mail@example.com>" }, () => {
    assert.equal(emailFromHeader(), "1500 Blueprint <login@1500satblueprint.com>");
  });
});

test("broadcast configuration requires both the student Segment and live-call Topic", () => {
  withEnvironment({ RESEND_STUDENT_SEGMENT_ID: "segment-1", RESEND_LIVE_CALL_TOPIC_ID: undefined }, () => {
    assert.equal(resendBroadcastConfig(), null);
  });
  withEnvironment({ RESEND_STUDENT_SEGMENT_ID: "segment-1", RESEND_LIVE_CALL_TOPIC_ID: "topic-1" }, () => {
    assert.deepEqual(resendBroadcastConfig(), { segmentId: "segment-1", topicId: "topic-1" });
  });
});

test("reply-to accepts only a real email address", () => {
  withEnvironment({ EMAIL_REPLY_TO: "support@example.com" }, () => {
    assert.deepEqual(emailReplyTo(), ["support@example.com"]);
  });
  withEnvironment({ EMAIL_REPLY_TO: "not-an-email" }, () => {
    assert.equal(emailReplyTo(), undefined);
  });
});

function withEnvironment(values: Record<string, string | undefined>, callback: () => void): void {
  const original = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    callback();
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
