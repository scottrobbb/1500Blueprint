import assert from "node:assert/strict";
import test from "node:test";
import { sessionSecret } from "./session-secret";

test("session signing requires at least 32 bytes of secret material", () => {
  assert.throws(() => sessionSecret(undefined), /not configured/);
  assert.throws(() => sessionSecret("short-secret"), /at least 32 bytes/);
  assert.equal(sessionSecret("a".repeat(32)).byteLength, 32);
  assert.equal(sessionSecret("🔐".repeat(8)).byteLength, 32);
});
