import assert from "node:assert/strict";
import { test } from "node:test";
import { splitLabel } from "./strip-question-subtopic-labels";

test("strips a subtopic label paragraph from the stem", () => {
  const passage = "WORD IN CONTEXT\n\nNaturally found on the skin of the Hydrophylax bahuvistara tree frog, urumin peptide molecules are ______ quite useful.";
  const split = splitLabel(passage);
  assert.equal(split?.label, "WORD IN CONTEXT");
  assert.ok(split?.rest.startsWith("Naturally found"));
  assert.ok(!split?.rest.includes("WORD IN CONTEXT"));
});

test("handles multi-word labels with punctuation and CRLF", () => {
  for (const label of ["TEXT STRUCTURE AND PURPOSE", "CROSS-TEXT CONNECTIONS", "TRANSITIONS", "FORM, STRUCTURE AND SENSE"]) {
    const split = splitLabel(`${label}\r\n\r\nThe passage begins here and continues.`);
    assert.equal(split?.label, label, label);
    assert.equal(split?.rest, "The passage begins here and continues.");
  }
});

test("leaves ordinary passages alone", () => {
  const untouched = [
    "Naturally found on the skin of the tree frog, urumin peptides are useful.\n\nA second paragraph.",
    "The Battle of NASA and NOAA was a turf war.\n\nMore text.",
    null,
    "",
  ];
  for (const text of untouched) assert.equal(splitLabel(text), null, JSON.stringify(text));
});

test("does not strip when the caps line is the entire body", () => {
  assert.equal(splitLabel("WORD IN CONTEXT"), null);
  assert.equal(splitLabel("WORD IN CONTEXT\n\n   "), null);
});

test("does not treat a single short token or initials as a label", () => {
  assert.equal(splitLabel("A\n\nSome following text."), null);
  assert.equal(splitLabel("A. B.\n\nSome following text."), null);
});

test("does not strip a long all-caps opening line", () => {
  const shout = "THIS IS A VERY LONG ALL CAPS SENTENCE THAT IS REALLY PART OF THE PASSAGE ITSELF";
  assert.equal(splitLabel(`${shout}\n\nMore text.`), null);
});

test("keeps the remainder's own paragraph breaks", () => {
  const split = splitLabel("CENTRAL IDEAS AND DETAILS\n\nFirst paragraph.\n\nSecond paragraph.");
  assert.equal(split?.rest, "First paragraph.\n\nSecond paragraph.");
});
