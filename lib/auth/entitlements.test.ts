import assert from "node:assert/strict";
import test from "node:test";
import { accessForPlan, normalizeLegacyPlanCode, normalizePlanCode, PLAN_ENTITLEMENTS } from "./plans";

test("legacy Stripe labels normalize to stable plan codes", () => {
  assert.equal(normalizePlanCode("Core monthly"), "core");
  assert.equal(normalizePlanCode("1500 MAX"), "max");
  assert.equal(normalizePlanCode("complimentary"), "free");
  assert.equal(normalizePlanCode(null), "free");
});

test("existing pre-tier customers retain full access during migration", () => {
  assert.equal(normalizeLegacyPlanCode("testing"), "max");
  assert.equal(normalizeLegacyPlanCode("complimentary"), "max");
  assert.equal(normalizeLegacyPlanCode(null), "free");
});

test("plan capabilities reflect the current tier definition", () => {
  assert.equal(PLAN_ENTITLEMENTS.free.fullTestLimit, 1);
  assert.equal(PLAN_ENTITLEMENTS.core.dailyDrillLimit, 20);
  assert.equal(PLAN_ENTITLEMENTS.max.dailyDrillLimit, "unlimited");
  assert.equal(PLAN_ENTITLEMENTS.max.studyPlanner, true);
});

test("access records retain their resolution source", () => {
  const access = accessForPlan("core", "grant", "user-1");
  assert.equal(access.plan, "core");
  assert.equal(access.source, "grant");
  assert.equal(access.entitlements.discordRole, "core");
});
