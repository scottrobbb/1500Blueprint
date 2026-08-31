import assert from "node:assert/strict";
import test from "node:test";
import { resolveEmailFromHeader } from "./email";

test("authentication email defaults to Scott on the verified Blueprint domain", () => {
  assert.equal(
    resolveEmailFromHeader(undefined),
    "1500 Blueprint <scott@1500blueprint.com>",
  );
});

test("authentication email accepts only valid addresses on the verified domain", () => {
  assert.equal(
    resolveEmailFromHeader("Scott Robinson <scott@1500blueprint.com>"),
    "Scott Robinson <scott@1500blueprint.com>",
  );
  assert.equal(
    resolveEmailFromHeader("login@1500satblueprint.com"),
    "1500 Blueprint <scott@1500blueprint.com>",
  );
  assert.equal(
    resolveEmailFromHeader("attacker@example.com"),
    "1500 Blueprint <scott@1500blueprint.com>",
  );
  assert.equal(
    resolveEmailFromHeader("not-an-email"),
    "1500 Blueprint <scott@1500blueprint.com>",
  );
});
