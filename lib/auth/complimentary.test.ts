import assert from "node:assert/strict";
import test from "node:test";
import { isComplimentaryAccount } from "./complimentary";

test("recognizes legacy complimentary students", () => {
  assert.equal(isComplimentaryAccount({
    legacyPlan: "complimentary",
    isTestAccount: false,
    activeGrantPlan: null,
    hasPaidSubscription: false,
  }), true);
});

test("recognizes manually granted students as complimentary", () => {
  assert.equal(isComplimentaryAccount({
    legacyPlan: "free",
    isTestAccount: false,
    activeGrantPlan: "max",
    hasPaidSubscription: false,
  }), true);
});

test("never treats paid or QA accounts as complimentary", () => {
  assert.equal(isComplimentaryAccount({
    legacyPlan: "complimentary",
    isTestAccount: false,
    activeGrantPlan: "max",
    hasPaidSubscription: true,
  }), false);
  assert.equal(isComplimentaryAccount({
    legacyPlan: "max",
    isTestAccount: true,
    activeGrantPlan: "max",
    hasPaidSubscription: false,
  }), false);
  assert.equal(isComplimentaryAccount({
    legacyPlan: "free",
    isTestAccount: false,
    activeGrantPlan: "free",
    hasPaidSubscription: false,
  }), false);
});
