import assert from "node:assert/strict";
import test from "node:test";
import { maintenanceNoticeVisible } from "./maintenance";

const WINDOW_OPENS = Date.parse("2026-09-07T04:00:00Z");
const WINDOW_CLOSES = Date.parse("2026-09-07T04:15:00Z");

test("the notice shows in the run-up to the window", () => {
  assert.equal(maintenanceNoticeVisible(Date.parse("2026-09-06T19:00:00Z")), true);
  assert.equal(maintenanceNoticeVisible(WINDOW_OPENS - 1), true);
});

test("the notice stays up while the work is happening", () => {
  assert.equal(maintenanceNoticeVisible(WINDOW_OPENS), true);
  assert.equal(maintenanceNoticeVisible(WINDOW_CLOSES - 1), true);
});

test("the notice takes itself down once the window closes", () => {
  assert.equal(maintenanceNoticeVisible(WINDOW_CLOSES), false);
  assert.equal(maintenanceNoticeVisible(Date.parse("2026-09-07T12:00:00Z")), false);
});

// September is EDT (UTC-4), not EST. Reading the window as EST would hold the
// banner up until 05:15 UTC -- a full hour after the work finished.
test("the window is anchored to Eastern daylight time, not standard time", () => {
  assert.equal(maintenanceNoticeVisible(Date.parse("2026-09-07T04:30:00Z")), false);
});
