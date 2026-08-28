import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260827170000_private_paid_content.sql", import.meta.url),
  "utf8",
);
const completionMigration = readFileSync(
  new URL("../../supabase/migrations/20260828010000_complete_rls_and_storage_hardening.sql", import.meta.url),
  "utf8",
);
const deploymentVerification = readFileSync(
  new URL("../../supabase/tests/rls_storage_verification.sql", import.meta.url),
  "utf8",
);
const testLoader = readFileSync(new URL("../sat/loadTest.ts", import.meta.url), "utf8");
const drillLoader = readFileSync(new URL("../drills/loadDrillContent.ts", import.meta.url), "utf8");

function typeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return typeScriptFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test("paid question and answer loaders cannot use the browser-visible Supabase client", () => {
  for (const source of [testLoader, drillLoader]) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /supabaseAdmin/);
    assert.doesNotMatch(source, /supabasePublishable/);
  }
});

test("the RLS migration removes direct browser-role access to paid content", () => {
  for (const table of [
    "tests",
    "modules",
    "questions",
    "choices",
    "drills",
    "drill_questions",
    "drill_walkthrough_steps",
  ]) {
    assert.match(migration, new RegExp(`public\\.${table}\\b`));
  }
  assert.match(migration, /revoke all privileges[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /set public = false[\s\S]+where id = 'course-assets'/i);
});

test("legacy server-only schemas and storage buckets retain explicit least privilege", () => {
  for (const table of [
    "users",
    "community_posts",
    "flashcard_sets",
    "drill_attempts",
    "test_attempts",
    "student_recent_activity",
  ]) {
    assert.match(completionMigration, new RegExp(`public\\.${table}\\b`));
  }
  assert.match(completionMigration, /revoke all privileges on table[\s\S]+from public, anon, authenticated/i);
  assert.match(completionMigration, /revoke all on function public\.record_login\(text, text\)/i);
  assert.match(completionMigration, /'course-assets'[\s\S]+false[\s\S]+524288000/i);
  assert.match(completionMigration, /'figures'[\s\S]+true[\s\S]+10485760/i);
  assert.match(completionMigration, /as restrictive[\s\S]+to anon, authenticated/gi);
});

test("deployment verification checks table, column, RPC, and storage denial", () => {
  assert.match(deploymentVerification, /has_table_privilege/i);
  assert.match(deploymentVerification, /has_any_column_privilege/i);
  assert.match(deploymentVerification, /has_function_privilege/i);
  assert.match(deploymentVerification, /course assets require server mediation/i);
  assert.match(deploymentVerification, /figures require server mediation/i);
});

test("the deployment inventory contains every literal table and RPC referenced by app code", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const source = ["app", "components", "lib", "scripts", "utils"]
    .flatMap((directory) => typeScriptFiles(`${root}/${directory}`))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const tables = new Set([...source.matchAll(/\.from\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]));
  const functions = new Set([...source.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)].map((match) => match[1]));

  // Literal Storage bucket references share the same SDK method name.
  tables.delete("course-assets");

  for (const table of tables) assert.match(deploymentVerification, new RegExp(`'${table}'`));
  for (const fn of functions) assert.match(deploymentVerification, new RegExp(`'${fn}'`));
});
