import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_ENTITLEMENTS } from "@/lib/auth/plans";
import { buildSettingsPlanView } from "./plan-view";

test("the settings view represents every plan entitlement", () => {
  const view = buildSettingsPlanView(PLAN_ENTITLEMENTS.max, {
    questionBankUsed: 25,
    drillsUsedToday: null,
  });

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
  });
  const drills = view.usage.find((item) => item.key === "dailyDrillLimit");
  const challenge = view.features.find(
    (item) => item.key === "challengeQuestions",
  );
  const desmos = view.features.find((item) => item.key === "desmos101");

  assert.equal(drills?.included, false);
  assert.equal(drills?.unlockPlan, "core");
  assert.equal(challenge?.included, false);
  assert.equal(challenge?.unlockPlan, "core");
  assert.equal(desmos?.included, true);
});

test("core usage shows live finite allowances", () => {
  const view = buildSettingsPlanView(PLAN_ENTITLEMENTS.core, {
    questionBankUsed: 3001,
    drillsUsedToday: 5,
  });
  const bank = view.usage.find((item) => item.key === "questionBankLimit");
  const drills = view.usage.find((item) => item.key === "dailyDrillLimit");

  assert.equal(bank?.percentage, 100);
  assert.equal(bank?.valueLabel, "3,001 of 3,000 attempts");
  assert.equal(drills?.percentage, 25);
  assert.equal(drills?.valueLabel, "5 of 20 today");
});

test("max access renders unlimited drills and all capabilities", () => {
  const view = buildSettingsPlanView(PLAN_ENTITLEMENTS.max, {
    questionBankUsed: null,
    drillsUsedToday: null,
  });
  const bank = view.usage.find((item) => item.key === "questionBankLimit");
  const drills = view.usage.find((item) => item.key === "dailyDrillLimit");

  assert.equal(bank?.unavailable, true);
  assert.equal(drills?.unlimited, true);
  assert.equal(drills?.valueLabel, "Unlimited");
  assert.equal(view.features.every((item) => item.included), true);
});
