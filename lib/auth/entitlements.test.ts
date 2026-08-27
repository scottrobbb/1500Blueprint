import assert from "node:assert/strict";
import test from "node:test";
import { accessForPlan, accessForTestPersona, effectivePlan, highestPlan, normalizeLegacyPlanCode, normalizePlanCode, PLAN_ENTITLEMENTS } from "./plans";
import { isUltimatePreviewEmail } from "./ultimate";

test("legacy Stripe labels normalize to stable plan codes", () => {
  assert.equal(normalizePlanCode("Core monthly"), "core");
  assert.equal(normalizePlanCode("1500 MAX"), "max");
  assert.equal(normalizePlanCode("complimentary"), "free");
  assert.equal(normalizePlanCode(null), "free");
});

test("existing pre-tier customers retain full access during migration", () => {
  assert.equal(normalizeLegacyPlanCode("testing"), "max");
  assert.equal(normalizeLegacyPlanCode("complimentary"), "max");
  assert.equal(normalizeLegacyPlanCode("admin"), "max");
  assert.equal(normalizeLegacyPlanCode("dev"), "max");
  assert.equal(normalizeLegacyPlanCode(null), "free");
});

test("plan capabilities reflect the current tier definition", () => {
  assert.equal(PLAN_ENTITLEMENTS.free.fullTestLimit, 1);
  assert.equal(PLAN_ENTITLEMENTS.core.dailyDrillLimit, 20);
  assert.equal(PLAN_ENTITLEMENTS.max.dailyDrillLimit, "unlimited");
  assert.equal(PLAN_ENTITLEMENTS.free.studyPlanner, false);
  assert.equal(PLAN_ENTITLEMENTS.core.studyPlanner, false);
  assert.equal(PLAN_ENTITLEMENTS.max.studyPlanner, true);
});

test("access records retain their resolution source", () => {
  const access = accessForPlan("core", "grant", "user-1");
  assert.equal(access.plan, "core");
  assert.equal(access.source, "grant");
  assert.equal(access.entitlements.discordRole, "core");
});

test("the strongest active source wins instead of a lower manual grant", () => {
  assert.equal(highestPlan("core", "max", "free"), "max");
  assert.equal(highestPlan("max", "core"), "max");
  assert.equal(highestPlan("free", "core"), "core");
});

test("explicit persona grants replace stale legacy labels", () => {
  assert.equal(effectivePlan("free", null, "max"), "free");
  assert.equal(effectivePlan("core", "max", "free"), "max");
  assert.equal(effectivePlan(null, null, "max"), "max");
});

test("QA personas override stale legacy testing access", () => {
  assert.equal(accessForTestPersona("free", "qa-free")?.plan, "free");
  assert.equal(accessForTestPersona("core", "qa-core")?.plan, "core");
  assert.equal(accessForTestPersona("max", "qa-max")?.plan, "max");
  assert.equal(accessForTestPersona("suspended", "qa-suspended")?.active, false);
  assert.equal(accessForTestPersona(null, "qa-unknown"), null);
});

test("every authenticated student can enter the entitlement-gated Ultimate workspace", () => {
  assert.equal(isUltimatePreviewEmail("new-student@example.com"), true);
  assert.equal(isUltimatePreviewEmail("  "), false);
  assert.equal(isUltimatePreviewEmail(null), false);
});
