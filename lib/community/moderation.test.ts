import { test } from "node:test";
import assert from "node:assert/strict";
import { containsSlur } from "./moderation";

test("flags a plain slur", () => {
  assert.equal(containsSlur("get out of here you gook"), true);
});

test("is case-insensitive", () => {
  assert.equal(containsSlur("BEANER"), true);
});

test("catches digit leetspeak substitution", () => {
  assert.equal(containsSlur("n1gg3r"), true);
});

test("catches spaced-out evasion", () => {
  assert.equal(containsSlur("g o o k"), true);
});

test("catches punctuation-separated evasion", () => {
  assert.equal(containsSlur("f.a.g.g.o.t"), true);
});

test("flags fag and faggot as distinct entries", () => {
  assert.equal(containsSlur("that's so fag"), true);
  assert.equal(containsSlur("that's a faggot"), true);
});

test("flags tranny and rape", () => {
  assert.equal(containsSlur("tranny"), true);
  assert.equal(containsSlur("rape"), true);
});

test("does not flag ordinary text", () => {
  assert.equal(containsSlur("the slope of this line is 3/4, great job on the SAT prep"), false);
});

test("does not flag words that merely contain a root as a substring", () => {
  assert.equal(containsSlur("I love a good grape or drape"), false);
  assert.equal(containsSlur("check the car's transmission fluid"), false);
});

test("ignores empty input", () => {
  assert.equal(containsSlur(""), false);
});
