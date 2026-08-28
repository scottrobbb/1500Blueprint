import assert from "node:assert/strict";
import test from "node:test";
import { MAX_FLASHCARDS_PER_SET, parseSetInput } from "./input";

test("parseSetInput validates and normalizes a private set", () => {
  assert.deepEqual(parseSetInput({
    title: "Vocabulary",
    description: null,
    visibility: "shared",
    cards: [{ term: "abate", definition: "become less intense", termImageUrl: null }],
  }, false), {
    title: "Vocabulary",
    description: null,
    visibility: "private",
    cards: [{
      term: "abate",
      definition: "become less intense",
      termImageUrl: null,
      definitionImageUrl: null,
    }],
  });
});

test("parseSetInput rejects oversized, malformed, and active-content inputs", () => {
  assert.equal(parseSetInput({ title: "x", cards: new Array(MAX_FLASHCARDS_PER_SET + 1).fill({ term: "a", definition: "b" }) }, false), null);
  assert.equal(parseSetInput({ title: "x", cards: [{ term: 1, definition: "b" }] }, false), null);
  assert.equal(parseSetInput({ title: "x", cards: [{ term: "a", definition: "b", termImageUrl: "javascript:alert(1)" }] }, false), null);
});
