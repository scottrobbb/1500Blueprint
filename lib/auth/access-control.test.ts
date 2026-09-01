import assert from "node:assert/strict";
import test from "node:test";
import { FREE_PRACTICE_TEST_SLUG, testIndexIsAccessible } from "./access-control";
import { PLAN_ENTITLEMENTS } from "./plans";

test("practice-test-1 is always accessible regardless of plan or index", () => {
  assert.equal(testIndexIsAccessible(FREE_PRACTICE_TEST_SLUG, 0, PLAN_ENTITLEMENTS.free.fullTestLimit), true);
  // Even a hypothetical reorder that pushed it past every plan's limit must not lock it out.
  assert.equal(testIndexIsAccessible(FREE_PRACTICE_TEST_SLUG, 99, PLAN_ENTITLEMENTS.free.fullTestLimit), true);
});

test("free plan is limited to test 1 and nothing beyond it", () => {
  const limit = PLAN_ENTITLEMENTS.free.fullTestLimit;
  assert.equal(testIndexIsAccessible("practice-test-2", 1, limit), false);
});

test("core plan reaches tests 1 and 2 (index 0-1) but not test 3", () => {
  const limit = PLAN_ENTITLEMENTS.core.fullTestLimit;
  assert.equal(testIndexIsAccessible("practice-test-1", 0, limit), true);
  assert.equal(testIndexIsAccessible("practice-test-2", 1, limit), true);
  assert.equal(testIndexIsAccessible("practice-test-6", 2, limit), false);
});

test("max plan reaches every published test with no cap", () => {
  const limit = PLAN_ENTITLEMENTS.max.fullTestLimit;
  assert.equal(limit, "unlimited");
  // Publishing more tests must not require an entitlement change, so no index
  // is out of reach -- including ones far past any previous numeric limit.
  for (const index of [0, 1, 2, 3, 4, 5, 99]) {
    assert.equal(testIndexIsAccessible(`practice-test-${index + 1}`, index, limit), true);
  }
});

test("a slug missing from the published list is never accessible", () => {
  assert.equal(testIndexIsAccessible("practice-test-3", -1, PLAN_ENTITLEMENTS.max.fullTestLimit), false);
});
