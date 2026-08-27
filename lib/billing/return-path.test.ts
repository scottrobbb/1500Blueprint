import assert from "node:assert/strict";
import test from "node:test";
import { billingReturnPath } from "./return-path";

test("billing return paths stay inside the application", () => {
  assert.equal(
    billingReturnPath("/settings/subscription"),
    "/settings/subscription",
  );
  assert.equal(
    billingReturnPath("/ultimate?tab=billing"),
    "/ultimate?tab=billing",
  );
  assert.equal(
    billingReturnPath("https://attacker.example"),
    "/settings/subscription",
  );
  assert.equal(
    billingReturnPath("//attacker.example"),
    "/settings/subscription",
  );
  assert.equal(
    billingReturnPath("/\\attacker.example"),
    "/settings/subscription",
  );
});

test("billing return paths support a caller-provided fallback", () => {
  assert.equal(billingReturnPath(null, "/pricing"), "/pricing");
});
