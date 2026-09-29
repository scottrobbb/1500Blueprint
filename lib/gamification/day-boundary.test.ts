import { test } from "node:test";
import assert from "node:assert/strict";
import { dateKey, dayStart, mondayIndex, shiftKey, weekStart } from "./engine";

test("10pm Monday Eastern is still Monday", () => {
  // 2026-09-28 22:00 EDT = 2026-09-29 02:00 UTC.
  const lateMonday = new Date("2026-09-29T02:00:00Z");
  assert.equal(dateKey(lateMonday), "2026-09-28");
  assert.equal(mondayIndex(lateMonday), 0);
});

test("the day starts at Eastern midnight in summer and winter", () => {
  assert.equal(dayStart("2026-09-28").toISOString(), "2026-09-28T04:00:00.000Z");
  assert.equal(dayStart("2026-12-07").toISOString(), "2026-12-07T05:00:00.000Z");
});

test("a day that ends in a DST change starts at the right midnight", () => {
  // Clocks fall back at 2am on 2026-11-01; that day still starts on EDT.
  assert.equal(dayStart("2026-11-01").toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(dayStart("2026-11-02").toISOString(), "2026-11-02T05:00:00.000Z");
});

test("the week starts at Eastern midnight on Monday", () => {
  assert.equal(weekStart(new Date("2026-10-04T03:59:00Z")).toISOString(), "2026-09-28T04:00:00.000Z");
  assert.equal(weekStart(new Date("2026-10-05T04:00:00Z")).toISOString(), "2026-10-05T04:00:00.000Z");
});

test("shiftKey is calendar arithmetic", () => {
  assert.equal(shiftKey("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftKey("2026-11-01", 1), "2026-11-02");
});
