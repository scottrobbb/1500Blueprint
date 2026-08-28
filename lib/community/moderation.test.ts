import { test } from "node:test";
import assert from "node:assert/strict";
import { containsSlur } from "./moderation";

test("flags a plain slur", () => {
  assert.equal(containsSlur("get out of here you chink"), true);
});

test("is case-insensitive", () => {
  assert.equal(containsSlur("KIKE"), true);
});

test("catches digit leetspeak substitution", () => {
  assert.equal(containsSlur("n1gg3r"), true);
});

test("catches spaced-out evasion", () => {
  assert.equal(containsSlur("g o o k"), true);
});

test("catches punctuation-separated evasion", () => {
  assert.equal(containsSlur("s.p.i.c"), true);
});

test("catches a two-word slur", () => {
  assert.equal(containsSlur("stop being a porch monkey"), true);
});

test("does not flag ordinary text", () => {
  assert.equal(containsSlur("the slope of this line is 3/4, great job on the SAT prep"), false);
});

test("does not flag words that merely contain a slur root as a substring", () => {
  assert.equal(containsSlur("I saw a raccoon and a cocoon near the trail"), false);
  assert.equal(containsSlur("Aboriginal history is a common reading passage topic"), false);
  assert.equal(containsSlur("let's talk about the reading section"), false);
});

test("ignores empty input", () => {
  assert.equal(containsSlur(""), false);
});
