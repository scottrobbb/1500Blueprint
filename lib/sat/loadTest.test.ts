import assert from "node:assert/strict";
import test from "node:test";
import { getModuleByKey } from "./modules";
import { parseModuleAttemptSnapshot, parsePracticeTestSnapshot } from "./testSnapshot";
import { sampleTest } from "./sampleTest";

test("completed-test snapshots accept a complete serialized form", () => {
  const serialized = JSON.parse(JSON.stringify(sampleTest)) as unknown;
  const snapshot = parsePracticeTestSnapshot(serialized);
  assert.ok(snapshot);
  assert.equal(snapshot.id, sampleTest.id);
  assert.equal(snapshot.sections.length, sampleTest.sections.length);
  assert.equal(snapshot.sections[0].module1.questions[0].prompt, sampleTest.sections[0].module1.questions[0].prompt);
});

test("completed-test snapshots reject partial or malformed forms", () => {
  assert.equal(parsePracticeTestSnapshot(null), null);
  assert.equal(parsePracticeTestSnapshot({ id: "partial", title: "Partial", sections: [] }), null);

  const malformed = JSON.parse(JSON.stringify(sampleTest)) as { sections: Array<{ module2: { easy: { questions: unknown[] } } }> };
  malformed.sections[0].module2.easy.questions = [{ id: "missing-question-fields" }];
  assert.equal(parsePracticeTestSnapshot(malformed), null);
});

test("module-attempt snapshots keep only the administered immutable module", () => {
  const found = getModuleByKey(sampleTest, "math-1");
  assert.ok(found);
  const serialized = JSON.parse(JSON.stringify({ meta: found.meta, module: found.module })) as unknown;
  const snapshot = parseModuleAttemptSnapshot(serialized);
  assert.ok(snapshot);
  assert.equal(snapshot.meta.key, "math-1");
  assert.equal(snapshot.module.questions.length, found.module.questions.length);
});

test("module-attempt snapshots reject incomplete metadata or questions", () => {
  assert.equal(parseModuleAttemptSnapshot(null), null);
  assert.equal(parseModuleAttemptSnapshot({ meta: { key: "rw-1" }, module: {} }), null);
});
