import assert from "node:assert/strict";
import test from "node:test";
import { SAT_WEEKEND_DATES, upcomingSatDates } from "./sat-dates";

test("returns only SAT dates after today", () => {
  assert.deepEqual(upcomingSatDates("2026-09-05").slice(0, 3), [
    "2026-09-12",
    "2026-10-03",
    "2026-11-07",
  ]);
  assert.deepEqual(upcomingSatDates("2026-12-05"), ["2027-03-06", "2027-05-01"]);
});

test("every listed date is a real Saturday, in order, and none has passed unnoticed", () => {
  const parsed = SAT_WEEKEND_DATES.map((date) => new Date(`${date}T00:00:00.000Z`));
  for (const [index, date] of parsed.entries()) {
    assert.equal(date.getUTCDay(), 6, `${SAT_WEEKEND_DATES[index]} is not a Saturday`);
    if (index > 0) {
      assert.ok(SAT_WEEKEND_DATES[index] > SAT_WEEKEND_DATES[index - 1], "dates must ascend");
    }
  }
});

// Nothing past May 2027 is confirmed, so the list simply ends. Callers treat an
// empty result as "pick your own date" rather than inventing one.
test("the list runs out rather than guessing at unconfirmed dates", () => {
  assert.deepEqual(upcomingSatDates("2027-05-01"), []);
  assert.deepEqual(upcomingSatDates("2028-01-01"), []);
});
