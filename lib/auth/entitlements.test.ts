import assert from "node:assert/strict";
import test from "node:test";
import { accessForPlan, accessForTestPersona, canAccessCourse, effectivePlan, hasCourseAccess, highestPlan, normalizeLegacyPlanCode, normalizePlanCode, PLAN_ENTITLEMENTS } from "./plans";
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
  assert.equal(PLAN_ENTITLEMENTS.max.fullTestLimit, "unlimited");
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

test("course access requires an active account as well as the right plan", () => {
  assert.equal(canAccessCourse(accessForPlan("free", "free", "free-user"), "desmos-101"), true);
  assert.equal(canAccessCourse(accessForPlan("free", "free", "free-user"), "blueprint-foundations"), false);
  assert.equal(canAccessCourse(accessForPlan("core", "subscription", "core-user"), "advanced-math"), false);
  assert.equal(canAccessCourse(accessForPlan("max", "subscription", "max-user"), "advanced-math"), true);
  assert.equal(
    canAccessCourse(accessForPlan("max", "subscription", "suspended-user", false, "suspended"), "desmos-101"),
    false,
  );
});

test("the strongest active source wins instead of a lower manual grant", () => {
  assert.equal(highestPlan("core", "max", "free"), "max");
  assert.equal(highestPlan("max", "core"), "max");
  assert.equal(highestPlan("free", "core"), "core");
});

test("explicit persona grants replace stale legacy labels", () => {
  assert.equal(effectivePlan("free", null, "max", false), "free");
  assert.equal(effectivePlan("core", "max", "free", true), "max");
  assert.equal(effectivePlan(null, null, "max", false), "max");
  assert.equal(effectivePlan(null, null, "max", true), "free");
});

test("a canceled tracked subscription cannot fall back to stale legacy paid access", () => {
  assert.equal(effectivePlan(null, null, "max", true), "free");
  assert.equal(effectivePlan("core", null, "max", true), "core");
  assert.equal(effectivePlan(null, "max", "free", true), "max");
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

test("Desmos 101 and Reading 101 remain available on every plan; Foundations and subtopic courses require Max", () => {
  assert.equal(hasCourseAccess(PLAN_ENTITLEMENTS.free, "desmos-101"), true);
  assert.equal(hasCourseAccess(PLAN_ENTITLEMENTS.free, "reading-101"), true);
  assert.equal(hasCourseAccess(PLAN_ENTITLEMENTS.free, "blueprint-foundations"), false);
  assert.equal(hasCourseAccess(PLAN_ENTITLEMENTS.free, "math-subtopic-course"), false);
  assert.equal(hasCourseAccess(PLAN_ENTITLEMENTS.max, "blueprint-foundations"), true);
  assert.equal(hasCourseAccess(PLAN_ENTITLEMENTS.max, "math-subtopic-course"), true);
});

test("an admin Max grant outranks a lapsed or downgraded subscription", () => {
  // The reason complimentary access is written to access_grants and not to
  // users.plan: the legacy plan is only consulted when a student has no
  // tracked subscription at all, so a comp'd student who once paid would
  // silently get nothing.
  assert.equal(effectivePlan(null, null, "max", true), "free");
  assert.equal(effectivePlan("max", null, "free", true), "max");

  // It also has to beat a live lower-tier subscription rather than tie with it.
  assert.equal(effectivePlan("max", "core", "free", true), "max");

  // And revoking the grant hands the student back to their own subscription.
  assert.equal(effectivePlan(null, "core", "free", true), "core");
  assert.equal(effectivePlan(null, null, "free", true), "free");
});

test("a granted Max student gets the full Max entitlement set", () => {
  const granted = accessForPlan("max", "grant", "user-1");
  assert.equal(granted.active, true);
  assert.equal(granted.source, "grant");
  assert.deepEqual(granted.entitlements, PLAN_ENTITLEMENTS.max);
});
