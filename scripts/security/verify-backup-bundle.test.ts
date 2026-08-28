import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyBackupBundle } from "./verify-backup-bundle";

const SCHEMA_RELATIONS = [
  "users", "student_subscriptions", "billing_webhook_events", "billing_checkout_intents",
  "tests", "modules", "questions", "choices", "drills", "drill_questions", "courses",
  "course_lessons",
];
const DATA_RELATIONS = [
  "users", "student_subscriptions", "tests", "questions", "drills", "drill_questions", "courses",
];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "blueprint-backup-"));
  mkdirSync(join(root, "storage", "course-assets"), { recursive: true });
  mkdirSync(join(root, "storage", "figures"), { recursive: true });
  writeFileSync(join(root, "roles.sql"), "CREATE ROLE recovery_reader;\n");
  writeFileSync(join(root, "schema.sql"), SCHEMA_RELATIONS.map((name) => (
    `CREATE TABLE public.${name} (id text);`
  )).join("\n"));
  writeFileSync(join(root, "data.sql"), DATA_RELATIONS.map((name) => (
    `COPY public.${name} (id) FROM stdin;\nrow\n\\.`
  )).join("\n"));
  writeFileSync(join(root, "storage", "course-assets", "lesson.pdf"), "course");
  writeFileSync(join(root, "storage", "figures", "avatar.png"), "figure");
  writeChecksums(root, [
    "roles.sql", "schema.sql", "data.sql", "storage/course-assets/lesson.pdf",
    "storage/figures/avatar.png",
  ]);
  return root;
}

function writeChecksums(root: string, paths: string[]) {
  const lines = paths.map((path) => {
    const bytes = readFileSync(join(root, path));
    return `${createHash("sha256").update(bytes).digest("hex")}  ${path}`;
  });
  writeFileSync(join(root, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

test("complete database and Storage backups pass offline integrity verification", async () => {
  const root = fixture();
  try {
    const result = await verifyBackupBundle(root);
    assert.equal(result.verified, true);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.storageObjects, { "course-assets": 1, figures: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("modified backup bytes fail their recorded checksum", async () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "storage", "course-assets", "lesson.pdf"), "tampered");
    const result = await verifyBackupBundle(root);
    assert.equal(result.verified, false);
    assert.ok(result.failures.includes("checksum mismatch for storage/course-assets/lesson.pdf"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a structurally valid dump still fails when critical billing data is absent", async () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "data.sql"), "COPY public.users (id) FROM stdin;\nrow\n\\.\n");
    const result = await verifyBackupBundle(root);
    assert.equal(result.verified, false);
    assert.ok(result.failures.includes("data.sql does not contain COPY data for public.student_subscriptions"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
