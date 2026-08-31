import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_ENTITLEMENTS } from "@/lib/auth/plans";
import { buildSettingsPlanView } from "./plan-view";

test("the settings view represents every plan entitlement", () => {
  const view = buildSettingsPlanView(PLAN_ENTITLEMENTS.max, {
    questionBankUsed: 25,
    drillsUsedToday: null,
  }, "max");

  assert.deepEqual(
    view.usage.map((item) => item.key),
    ["questionBankLimit", "fullTestLimit", "dailyDrillLimit"],
  );
  assert.deepEqual(
    view.features.map((item) => item.key),
    [
      "desmos101",
      "readingWriting101",
      "challengeQuestions",
      "allCourses",
      "studyPlanner",
      "liveGroupClasses",
      "discordRole",
    ],
  );
});

test("free access marks paid capabilities as locked", () => {
  const view = buildSettingsPlanView(PLAN_ENTITLEMENTS.free, {
    questionBankUsed: 12,
    drillsUsedToday: null,
  }, "free");
  const drills = view.usage.find((item) => item.key === "dailyDrillLimit");
  const challenge = view.features.find(
    (item) => item.key === "challengeQuestions",
  );
  const desmos = view.features.find((item) => item.key === "desmos101");

  const bank = view.usage.find((item) => item.key === "questionBankLimit");

  // Nothing enforces free's 200-attempt entitlement -- its exposure is capped
  // by the curated free-tier pool -- so the row must not quote an allowance.
  assert.equal(bank?.included, true);
  assert.equal(bank?.valueLabel, "Sample library");
  assert.equal(bank?.used, null);
  assert.equal(bank?.limit, null);
  assert.equal(bank?.percentage, null);
  assert.equal(bank?.unavailable, false);

  assert.equal(drills?.included, false);
  assert.equal(drills?.unlockPlan, "core");
  assert.equal(challenge?.included, false);
  assert.equal(challenge?.unlockPlan, "core");
  assert.equal(desmos?.included, true);
});

test("core gets the whole Question Bank and a live daily drill allowance", () => {
  const view = buildSettingsPlanView(PLAN_ENTITLEMENTS.core, {
    questionBankUsed: 3001,
    drillsUsedToday: 5,
  }, "core");
  const bank = view.usage.find((item) => item.key === "questionBankLimit");
  const drills = view.usage.find((item) => item.key === "dailyDrillLimit");

  assert.equal(bank?.unlimited, true);
  assert.equal(bank?.percentage, null);
  assert.equal(bank?.valueLabel, "Unlimited");
  assert.equal(drills?.percentage, 25);
  assert.equal(drills?.valueLabel, "5 of 20 today");
});

test("max access renders unlimited drills and all capabilities", () => {
  const view = buildSettingsPlanView(PLAN_ENTITLEMENTS.max, {
    questionBankUsed: null,
    drillsUsedToday: null,
  }, "max");
  const bank = view.usage.find((item) => item.key === "questionBankLimit");
  const drills = view.usage.find((item) => item.key === "dailyDrillLimit");

  assert.equal(bank?.unavailable, false);
  assert.equal(bank?.unlimited, true);
  assert.equal(bank?.valueLabel, "Unlimited");
  assert.equal(drills?.unlimited, true);
  assert.equal(drills?.valueLabel, "Unlimited");
  assert.equal(view.features.every((item) => item.included), true);
});

test("a free student with unreadable usage still sees their sample library", () => {
  const view = buildSettingsPlanView(PLAN_ENTITLEMENTS.free, {
    questionBankUsed: null,
    drillsUsedToday: null,
  }, "free");
  const bank = view.usage.find((item) => item.key === "questionBankLimit");

  assert.equal(bank?.valueLabel, "Sample library");
  assert.equal(bank?.unavailable, false);
});
