import assert from "node:assert/strict";
import test from "node:test";
import { appAccessLogin } from "./login-eligibility";

const deps = (plan: "free" | "core" | "max", active = true, stored: string | null = null) => ({
  getStudentAccess: async () => ({ active, plan }),
  storedPlan: async () => stored,
});

test("a one-week Max pass earns a login link", async () => {
  assert.deepEqual(await appAccessLogin("a@b.co", deps("max")), { active: true, plan: null });
});

test("the token keeps the stored plan so logging in cannot upgrade it", async () => {
  assert.deepEqual(await appAccessLogin("a@b.co", deps("max", true, "free")), { active: true, plan: "free" });
});

test("free and suspended accounts still get no link", async () => {
  assert.equal((await appAccessLogin("a@b.co", deps("free"))).active, false);
  assert.equal((await appAccessLogin("a@b.co", deps("max", false))).active, false);
});
