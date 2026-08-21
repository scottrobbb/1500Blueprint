import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPaidAccessStatus,
  isRefundEligible,
  planChangeDirection,
  refundDeadline,
} from "./policy";

test("paid access includes Stripe retry grace but excludes terminal statuses", () => {
  assert.equal(hasPaidAccessStatus("active"), true);
  assert.equal(hasPaidAccessStatus("trialing"), true);
  assert.equal(hasPaidAccessStatus("past_due"), true);
  assert.equal(hasPaidAccessStatus("unpaid"), false);
  assert.equal(hasPaidAccessStatus("canceled"), false);
});

test("plan changes use immediate upgrades and scheduled downgrades", () => {
  assert.equal(planChangeDirection("core", "max"), "upgrade");
  assert.equal(planChangeDirection("max", "core"), "downgrade");
  assert.equal(planChangeDirection("max", "max"), "same");
});

test("refund window is exactly 24 hours from the first purchase", () => {
  const purchased = new Date("2026-08-20T12:00:00.000Z");
  const deadline = refundDeadline(purchased, 24);
  assert.equal(deadline.toISOString(), "2026-08-21T12:00:00.000Z");
  assert.equal(isRefundEligible({
    isFirstSubscription: true,
    refundableUntil: deadline,
    alreadyRefunded: false,
    now: new Date("2026-08-21T12:00:00.000Z"),
  }), true);
  assert.equal(isRefundEligible({
    isFirstSubscription: true,
    refundableUntil: deadline,
    alreadyRefunded: false,
    now: new Date("2026-08-21T12:00:00.001Z"),
  }), false);
  assert.equal(isRefundEligible({
    isFirstSubscription: false,
    refundableUntil: deadline,
    alreadyRefunded: false,
    now: purchased,
  }), false);
});
