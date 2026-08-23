import assert from "node:assert/strict";
import test from "node:test";
import { upcomingSatDates } from "./sat-dates";

test("returns only SAT dates after today", () => {
  assert.deepEqual(upcomingSatDates("2026-08-22").slice(0, 3), [
    "2026-09-12",
    "2026-10-03",
    "2026-11-07",
  ]);
});

test("moves to the next testing year after the final confirmed 2026-27 date", () => {
  assert.equal(upcomingSatDates("2027-06-05")[0], "2027-08-28");
});
