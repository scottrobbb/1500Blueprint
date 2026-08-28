/**
 * Offline integrity and coverage check for a manual Supabase recovery bundle.
 * The script never connects to Supabase and never prints SQL or object names.
 *
 *   npm run security:verify:backup -- --directory=/secure/backups/2026-08-28
 */
import { createHash } from "node:crypto";
import {
  createReadStream,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const DATABASE_FILES = ["roles.sql", "schema.sql", "data.sql"] as const;
const STORAGE_BUCKETS = ["course-assets", "figures"] as const;
const CRITICAL_SCHEMA_RELATIONS = [
  "users",
  "student_subscriptions",
  "billing_webhook_events",
  "billing_checkout_intents",
  "tests",
  "modules",
  "questions",
  "choices",
  "drills",
  "drill_questions",
  "courses",
  "course_lessons",
] as const;
const CRITICAL_DATA_RELATIONS = [
  "users",
  "student_subscriptions",
  "tests",
  "questions",
  "drills",
  "drill_questions",
  "courses",
] as const;
const CHECKSUM_FILE = "SHA256SUMS";

export type BackupVerification = {
  verified: boolean;
  files: number;
  checksums: number;
  storageObjects: Record<(typeof STORAGE_BUCKETS)[number], number>;
  failures: string[];
};

export async function verifyBackupBundle(directory: string): Promise<BackupVerification> {
  const root = resolve(directory);
  const failures: string[] = [];
  const allFiles = regularFiles(root, failures);
  const expectedFiles = allFiles.filter((path) => relative(root, path) !== CHECKSUM_FILE);

  for (const filename of DATABASE_FILES) {
    const path = join(root, filename);
    if (!isNonEmptyRegularFile(path)) failures.push(`missing or empty ${filename}`);
  }

  const storageObjects = Object.fromEntries(STORAGE_BUCKETS.map((bucket) => {
    const bucketRoot = join(root, "storage", bucket);
    const count = allFiles.filter((path) => isWithin(bucketRoot, path)).length;
    if (count === 0) failures.push(`storage/${bucket} has no backed-up objects`);
    return [bucket, count];
  })) as BackupVerification["storageObjects"];

  const schema = safeRead(join(root, "schema.sql"));
  for (const relation of CRITICAL_SCHEMA_RELATIONS) {
    if (!containsRelationDefinition(schema, relation)) {
      failures.push(`schema.sql does not define public.${relation}`);
    }
  }

  const copiedRelations = await copyRelations(join(root, "data.sql"));
  for (const relation of CRITICAL_DATA_RELATIONS) {
    if (!copiedRelations.has(relation)) {
      failures.push(`data.sql does not contain COPY data for public.${relation}`);
    }
  }

  const checksums = await verifyChecksums(root, expectedFiles, failures);
  return {
    verified: failures.length === 0,
    files: expectedFiles.length,
    checksums,
    storageObjects,
    failures,
  };
}

function regularFiles(root: string, failures: string[]): string[] {
  if (!isDirectory(root)) return failures.push("backup directory does not exist"), [];
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) {
        failures.push(`backup contains a symbolic link: ${relative(root, path)}`);
      } else if (metadata.isDirectory()) {
        visit(path);
      } else if (metadata.isFile()) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files;
}

async function verifyChecksums(root: string, expectedFiles: string[], failures: string[]): Promise<number> {
  const checksumPath = join(root, CHECKSUM_FILE);
  if (!isNonEmptyRegularFile(checksumPath)) {
    failures.push(`missing or empty ${CHECKSUM_FILE}`);
    return 0;
  }

  const entries = new Map<string, string>();
  for (const [index, line] of readFileSync(checksumPath, "utf8").split(/\r?\n/).entries()) {
    if (!line) continue;
    const match = line.match(/^([a-fA-F0-9]{64})\s{1,2}(.+)$/);
    if (!match) {
      failures.push(`${CHECKSUM_FILE} has an invalid line ${index + 1}`);
      continue;
    }
    const name = normalizeRelativePath(match[2]);
    if (!name || entries.has(name)) {
      failures.push(`${CHECKSUM_FILE} has an unsafe or duplicate entry on line ${index + 1}`);
      continue;
    }
    entries.set(name, match[1].toLowerCase());
  }

  const expectedNames = expectedFiles.map((path) => normalizeRelativePath(relative(root, path)) as string);
  for (const name of expectedNames) {
    const expected = entries.get(name);
    if (!expected) {
      failures.push(`${CHECKSUM_FILE} is missing ${name}`);
      continue;
    }
    const actual = await sha256(join(root, name));
    if (actual !== expected) failures.push(`checksum mismatch for ${name}`);
  }
  for (const name of entries.keys()) {
    if (!expectedNames.includes(name)) failures.push(`${CHECKSUM_FILE} references an unexpected file: ${name}`);
  }
  return entries.size;
}

function containsRelationDefinition(sql: string, relation: string): boolean {
  const escaped = relation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(?:"?public"?\\.)?"?${escaped}"?\\b`, "i").test(sql);
}

async function copyRelations(path: string): Promise<Set<string>> {
  const relations = new Set<string>();
  if (!isNonEmptyRegularFile(path)) return relations;
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    const match = line.match(/^COPY\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?\s*\(/i);
    if (match) relations.add(match[1].toLowerCase());
  }
  return relations;
}

function normalizeRelativePath(value: string): string | null {
  const normalized = value.replace(/^\*?\.\//, "").replaceAll("\\", "/");
  if (!normalized || isAbsolute(normalized) || normalized.split("/").includes("..")) return null;
  return normalized;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function safeRead(path: string): string {
  return isNonEmptyRegularFile(path) ? readFileSync(path, "utf8") : "";
}

function isNonEmptyRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile() && statSync(path).size > 0;
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child));
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function parseDirectory(argv: string[]): string {
  if (argv.length !== 1 || !argv[0].startsWith("--directory=")) {
    throw new Error("Usage: verify-backup-bundle.ts --directory=/path/to/backup");
  }
  const directory = argv[0].slice("--directory=".length);
  if (!directory) throw new Error("Backup directory is required");
  return directory;
}

async function main() {
  const result = await verifyBackupBundle(parseDirectory(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  if (!result.verified) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Backup verification failed");
    process.exitCode = 1;
  });
}
