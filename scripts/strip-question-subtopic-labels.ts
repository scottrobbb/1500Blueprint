/**
 * Strip leading all-caps subtopic labels from imported test questions.
 *
 * Some imports carry the subtopic into the question body as its own paragraph
 * ("WORD IN CONTEXT" above the stem). QuestionContent splits on blank lines, so
 * the label renders as a paragraph of its own. The subtopic is already stored
 * structurally in questions.skill; this removes the duplicate prose copy.
 *
 * Review first (default -- reads only, writes nothing):
 *   npx tsx --env-file=.env.local scripts/strip-question-subtopic-labels.ts
 *
 * Restrict to labels you confirmed in the dry run, then apply:
 *   npx tsx --env-file=.env.local scripts/strip-question-subtopic-labels.ts \
 *     --only="WORD IN CONTEXT,TEXT STRUCTURE AND PURPOSE" --write
 *
 * Options:
 *   --test=3        only this test slug suffix (default: every test)
 *   --only="A,B"    only these exact labels (recommended before --write)
 *   --write         apply; every changed row is backed up to a JSON file first
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const write = args.includes("--write");
const testArg = args.find((a) => a.startsWith("--test="))?.slice("--test=".length);
const onlyArg = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const only = onlyArg
  ? new Set(onlyArg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))
  : null;

const FIELDS = ["passage", "prompt"] as const;
type Field = (typeof FIELDS)[number];

type QuestionRow = {
  id: string;
  module_id: string;
  position: number;
  skill: string | null;
  passage: string | null;
  prompt: string | null;
};

// A subtopic label is a leading block with no lowercase letters, made only of
// letters, digits, spaces and light punctuation, short enough to be a heading,
// and followed by actual content. Anything else is left alone -- a passage may
// legitimately open on a caps line (a speaker name, a title), which is why the
// dry run lists every distinct label for review before --write.
const LABEL = /^[A-Z0-9][A-Z0-9 .,:;'&/()-]*$/;

export function splitLabel(text: string | null): { label: string; rest: string } | null {
  if (!text) return null;
  const normalized = text.replace(/\r\n/g, "\n");
  const match = normalized.match(/^\s*([^\n]+?)\s*\n\s*\n\s*([\s\S]+)$/);
  if (!match) return null;
  const [, first, rest] = match;
  if (first.length > 60) return null;
  if (!/[A-Z]/.test(first)) return null;
  if (/[a-z]/.test(first)) return null;
  if (!LABEL.test(first)) return null;
  if (!/[A-Z]{3}/.test(first.replace(/[^A-Z]/g, ""))) return null;
  if (!rest.trim()) return null;
  return { label: first, rest: rest.trim() };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  }
  const db = createClient(url, secret, { auth: { persistSession: false } });

  let testQuery = db.from("tests").select("id,slug,title");
  if (testArg) testQuery = testQuery.eq("slug", `practice-test-${testArg}`);
  const { data: tests, error: testError } = await testQuery;
  if (testError) throw new Error(`Could not read tests: ${testError.message}`);
  if (!tests?.length) throw new Error(testArg ? `No test with slug practice-test-${testArg}.` : "No tests found.");

  const { data: modules, error: moduleError } = await db
    .from("modules").select("id,test_id,label").in("test_id", tests.map((t) => t.id));
  if (moduleError) throw new Error(`Could not read modules: ${moduleError.message}`);

  const testBySlug = new Map(tests.map((t) => [t.id, t.slug as string]));
  const slugByModule = new Map((modules ?? []).map((m) => [m.id as string, testBySlug.get(m.test_id) ?? "?"]));

  const questions: QuestionRow[] = [];
  const moduleIds = (modules ?? []).map((m) => m.id as string);
  for (let i = 0; i < moduleIds.length; i += 50) {
    const { data, error } = await db
      .from("questions").select("id,module_id,position,skill,passage,prompt")
      .in("module_id", moduleIds.slice(i, i + 50));
    if (error) throw new Error(`Could not read questions: ${error.message}`);
    questions.push(...((data ?? []) as QuestionRow[]));
  }

  type Hit = { row: QuestionRow; field: Field; label: string; rest: string };
  const hits: Hit[] = [];
  for (const row of questions) {
    for (const field of FIELDS) {
      const split = splitLabel(row[field]);
      if (!split) continue;
      if (only && !only.has(split.label.toUpperCase())) continue;
      hits.push({ row, field, label: split.label, rest: split.rest });
    }
  }

  console.log(`Scanned ${questions.length} questions across ${tests.length} test(s).\n`);
  if (!hits.length) {
    console.log("No leading all-caps labels found.");
    return;
  }

  const byLabel = new Map<string, Hit[]>();
  for (const hit of hits) {
    const key = `${hit.label}  [${hit.field}]`;
    byLabel.set(key, [...(byLabel.get(key) ?? []), hit]);
  }
  console.log(`${hits.length} question field(s) start with an all-caps label:\n`);
  for (const [label, group] of [...byLabel.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const tests = new Set(group.map((h) => slugByModule.get(h.row.module_id)));
    console.log(`  ${String(group.length).padStart(3)}x  ${label}   (${[...tests].join(", ")})`);
    const sample = group[0];
    console.log(`        e.g. skill=${sample.row.skill ?? "-"}  -> ${JSON.stringify(sample.rest.slice(0, 72))}…`);
  }

  if (!write) {
    console.log("\n[dry-run] Nothing was written.");
    console.log("Review the labels above, then re-run with --only=\"…\" --write to apply.");
    return;
  }

  const backupPath = path.resolve(`question-label-backup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(
    hits.map((h) => ({ id: h.row.id, field: h.field, before: h.row[h.field] })), null, 2));
  console.log(`\nBacked up ${hits.length} original value(s) to ${backupPath}`);

  let updated = 0;
  for (const hit of hits) {
    const { error } = await db.from("questions").update({ [hit.field]: hit.rest }).eq("id", hit.row.id);
    if (error) {
      console.error(`  failed ${hit.row.id} (${hit.field}): ${error.message}`);
      continue;
    }
    updated++;
  }
  console.log(`Updated ${updated} of ${hits.length} field(s).`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
