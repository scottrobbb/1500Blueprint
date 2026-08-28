import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const ALLOWED_ERROR_SINK = "lib/observability/server.ts";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (entry.name.endsWith(".test.ts")) return [];
    return extname(entry.name) === ".ts" || extname(entry.name) === ".tsx" ? [path] : [];
  });
}

test("server code routes unexpected errors through the privacy-safe reporter", () => {
  const files = [
    ...sourceFiles(join(ROOT, "app/api")),
    ...sourceFiles(join(ROOT, "app/admin")),
    ...sourceFiles(join(ROOT, "lib")),
  ];
  const offenders = files
    .map((path) => relative(ROOT, path))
    .filter((path) => path !== ALLOWED_ERROR_SINK)
    .filter((path) => /console\s*\.\s*error\s*\(/.test(readFileSync(join(ROOT, path), "utf8")));

  assert.deepEqual(offenders, []);
  assert.match(
    readFileSync(join(ROOT, ALLOWED_ERROR_SINK), "utf8"),
    /console\s*\.\s*error\s*\(/,
    "the central reporter must retain an error-level sink",
  );
});
