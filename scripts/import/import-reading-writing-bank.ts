/**
 * Import Scott's standalone Reading & Writing question-bank DOCX archive.
 *
 * Audit only:
 *   npx tsx --env-file=.env.local scripts/import/import-reading-writing-bank.ts "<archive.zip>"
 *
 * Write to Supabase after reviewing the audit:
 *   npx tsx --env-file=.env.local scripts/import/import-reading-writing-bank.ts "<archive.zip>" --write
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import {
  parseReadingBankDocx,
  type ParsedReadingBankDocument,
  type ParsedReadingBankQuestion,
} from "./reading-writing-bank";

const BUCKET = "figures";
const DRILL_SLUG = "grammar";
const COLLECTION = "Scott Reading Questions 2026-08-19";
const CREATED_BY = "scott-reading-import";
const DRAFT_NOTES = new Set([
  "multiple-choice item has duplicate choice text",
  "question has no explanation",
]);

type ChoiceId = "A" | "B" | "C" | "D";

type ArchiveParse = {
  documents: ParsedReadingBankDocument[];
  questions: ParsedReadingBankQuestion[];
};

type DrillQuestionRow = {
  id: string;
  drill_slug: typeof DRILL_SLUG;
  section: "rw";
  domain: string;
  skill: string;
  difficulty: "easy" | "medium" | "hard";
  answer_type: "mc_single";
  stem: string;
  passage: string | null;
  figure_url: string | null;
  content: Record<string, unknown>;
  explanation: string;
  status: "published" | "draft";
  created_by: typeof CREATED_BY;
  updated_at: string;
};

type ExistingQuestionRow = {
  id: string;
  status: string;
  figure_url: string | null;
};

const args = process.argv.slice(2);
const write = args.includes("--write");
const archivePath = args.find((arg) => !arg.startsWith("--")) ?? "";

if (!archivePath) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/import/import-reading-writing-bank.ts "<archive.zip>" [--write]');
  process.exit(1);
}

function normalizeFingerprint(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionFingerprint(question: ParsedReadingBankQuestion): string {
  return normalizeFingerprint(JSON.stringify({
    passage: question.passage,
    prompt: question.prompt,
    choices: question.choices.map((choice) => choice.text),
  }));
}

function questionId(question: ParsedReadingBankQuestion): string {
  const hash = crypto.createHash("sha256").update(questionFingerprint(question)).digest("hex");
  return `scott-reading-${hash.slice(0, 32)}`;
}

function fatalNotes(question: ParsedReadingBankQuestion): string[] {
  return question.notes.filter((note) => !DRAFT_NOTES.has(note));
}

function questionStatus(question: ParsedReadingBankQuestion): "published" | "draft" {
  return question.notes.some((note) => DRAFT_NOTES.has(note)) ? "draft" : "published";
}

function isChoiceId(value: string | null): value is ChoiceId {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

async function parseArchive(zipPath: string): Promise<ArchiveParse> {
  const archive = await JSZip.loadAsync(await fs.readFile(zipPath));
  const entries = Object.values(archive.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".docx"),
  );
  if (entries.length === 0) throw new Error("The archive contains no DOCX files.");

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "1500-reading-bank-"));
  const documents: ParsedReadingBankDocument[] = [];
  try {
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const temporaryPath = path.join(temporaryDirectory, `${String(index + 1).padStart(3, "0")}.docx`);
      await fs.writeFile(temporaryPath, await entry.async("nodebuffer"));
      documents.push(await parseReadingBankDocx(temporaryPath, entry.name));
    }
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }

  return { documents, questions: documents.flatMap((document) => document.questions) };
}

function validateQuestions(questions: ParsedReadingBankQuestion[]): void {
  const errors: string[] = [];
  const fingerprints = new Map<string, ParsedReadingBankQuestion>();
  const ids = new Set<string>();

  for (const question of questions) {
    const label = `${question.sourceFile} #${question.sourceOrdinal}`;
    if (!question.prompt.trim()) errors.push(`${label}: empty prompt`);
    if (!question.passage?.trim()) errors.push(`${label}: empty passage`);
    if (question.type !== "mc") errors.push(`${label}: expected multiple choice`);
    if (question.choices.length !== 4) errors.push(`${label}: expected four choices`);
    if (!isChoiceId(question.correct)) errors.push(`${label}: invalid answer key`);
    if (!question.explanation.trim() && questionStatus(question) === "published") {
      errors.push(`${label}: missing explanation`);
    }
    for (const note of fatalNotes(question)) errors.push(`${label}: ${note}`);

    const fingerprint = questionFingerprint(question);
    const duplicate = fingerprints.get(fingerprint);
    if (duplicate) {
      errors.push(`${label}: duplicates ${duplicate.sourceFile} #${duplicate.sourceOrdinal}`);
    } else {
      fingerprints.set(fingerprint, question);
    }

    const id = questionId(question);
    if (ids.has(id)) errors.push(`${label}: duplicate deterministic ID ${id}`);
    ids.add(id);
  }

  if (errors.length > 0) {
    throw new Error(`Import validation failed:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
  }
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {} as Record<T, number>);
}

function printAudit(parsed: ArchiveParse): void {
  const { documents, questions } = parsed;
  const declared = documents.reduce((total, document) => total + (document.expectedCount ?? 0), 0);
  const warningDocuments = documents.filter((document) => document.warnings.length > 0);
  const draftQuestions = questions.filter((question) => questionStatus(question) === "draft");

  console.log("Scott Reading & Writing archive audit");
  console.log(`  DOCX documents:          ${documents.length}`);
  console.log(`  Parsed questions:        ${questions.length}`);
  console.log(`  Source-declared total:   ${declared}`);
  console.log(`  Questions with figures:  ${questions.filter((question) => question.figureData).length}`);
  console.log(`  Held for source review:  ${draftQuestions.length}`);
  console.log(`  Domains:                 ${JSON.stringify(countBy(questions.map((question) => question.domain)))}`);
  console.log(`  Skills:                  ${JSON.stringify(countBy(questions.map((question) => question.skill)))}`);
  console.log(`  Difficulty:              ${JSON.stringify(countBy(questions.map((question) => question.difficulty)))}`);

  if (warningDocuments.length > 0) {
    console.log("\nSource mismatches:");
    for (const document of warningDocuments) {
      console.log(`  - ${document.sourcePath}: ${document.warnings.join("; ")}`);
    }
  }
  if (draftQuestions.length > 0) {
    console.log("\nQuestions imported as drafts:");
    for (const question of draftQuestions) {
      console.log(`  - ${question.sourcePath} #${question.sourceOrdinal}: ${question.notes.join("; ")}`);
    }
  }
}

function figureHash(question: ParsedReadingBankQuestion): string | null {
  if (!question.figureData) return null;
  return crypto.createHash("sha256").update(question.figureData.buffer).digest("hex");
}

function extensionFor(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/svg+xml") return "svg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "png";
}

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  if (error && !/not found/i.test(error.message)) throw error;
  const created = await supabase.storage.createBucket(BUCKET, { public: true });
  if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
}

async function uploadFigures(
  supabase: SupabaseClient,
  questions: ParsedReadingBankQuestion[],
): Promise<Map<string, string>> {
  await ensureBucket(supabase);
  const urls = new Map<string, string>();

  for (const question of questions) {
    const hash = figureHash(question);
    if (!hash || !question.figureData || urls.has(hash)) continue;
    const objectPath = `question-bank/reading-writing/${hash.slice(0, 32)}.${extensionFor(question.figureData.contentType)}`;
    const uploaded = await supabase.storage.from(BUCKET).upload(
      objectPath,
      question.figureData.buffer,
      { contentType: question.figureData.contentType, upsert: true },
    );
    if (uploaded.error) throw uploaded.error;
    const url = supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Uploaded figure is not publicly readable: ${objectPath}`);
    const downloadedHash = crypto.createHash("sha256")
      .update(Buffer.from(await response.arrayBuffer()))
      .digest("hex");
    if (downloadedHash !== hash) throw new Error(`Uploaded figure bytes do not match: ${objectPath}`);
    urls.set(hash, url);
  }

  return urls;
}

function toRow(
  question: ParsedReadingBankQuestion,
  figureUrls: Map<string, string>,
  updatedAt: string,
): DrillQuestionRow {
  if (!isChoiceId(question.correct)) throw new Error(`Invalid choice key for ${question.sourceFile}`);
  const source = {
    collection: COLLECTION,
    archivePath: question.sourcePath,
    document: question.sourceFile,
    ordinal: question.sourceOrdinal,
    sourceQuestionNumber: question.rawNumber,
  };
  const figure = figureHash(question);

  return {
    id: questionId(question),
    drill_slug: DRILL_SLUG,
    section: "rw",
    domain: question.domain,
    skill: question.skill,
    difficulty: question.difficulty,
    answer_type: "mc_single",
    stem: question.prompt,
    passage: question.passage,
    figure_url: figure ? figureUrls.get(figure) ?? null : null,
    content: {
      choices: question.choices.map((choice) => ({ id: choice.letter, text: choice.text })),
      correct: question.correct,
      source,
      reviewNotes: question.notes,
    },
    explanation: question.explanation,
    status: questionStatus(question),
    created_by: CREATED_BY,
    updated_at: updatedAt,
  };
}

async function upsertBatches(supabase: SupabaseClient, rows: DrillQuestionRow[]): Promise<void> {
  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100);
    const result = await supabase.from("drill_questions").upsert(batch, { onConflict: "id" });
    if (result.error) throw result.error;
    console.log(`  Questions: ${Math.min(index + batch.length, rows.length)}/${rows.length}`);
  }
}

function isMissingCatalog(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST205"
    || /question_bank_catalog.*(?:not find|does not exist|schema cache)/i.test(error.message);
}

async function allowlistQuestions(
  supabase: SupabaseClient,
  rows: DrillQuestionRow[],
): Promise<boolean> {
  const publishedRows = rows.filter((row) => row.status === "published");
  for (let index = 0; index < publishedRows.length; index += 200) {
    const batch = publishedRows.slice(index, index + 200).map((row) => ({
      question_id: row.id,
      access_tier: "ultimate",
      enabled: true,
    }));
    const result = await supabase.from("question_bank_catalog").upsert(batch, { onConflict: "question_id" });
    if (result.error) {
      if (index === 0 && isMissingCatalog(result.error)) return false;
      throw result.error;
    }
  }
  return true;
}

async function verifyLiveRows(
  supabase: SupabaseClient,
  expectedRows: DrillQuestionRow[],
): Promise<void> {
  const expectedById = new Map(expectedRows.map((row) => [row.id, row]));
  const result = await supabase
    .from("drill_questions")
    .select("id,status,figure_url")
    .eq("created_by", CREATED_BY)
    .range(0, 999);
  if (result.error) throw result.error;

  const rows = (result.data ?? []) as ExistingQuestionRow[];
  const imported = rows.filter((row) => expectedById.has(row.id));
  if (imported.length !== expectedById.size) {
    throw new Error(`Live verification found ${imported.length}/${expectedById.size} imported questions.`);
  }
  if (imported.some((row) => row.status !== expectedById.get(row.id)?.status)) {
    throw new Error("Live verification found an unexpected publication status.");
  }
  if (imported.some((row) => row.figure_url !== expectedById.get(row.id)?.figure_url)) {
    throw new Error("Live verification found a missing or unexpected figure URL.");
  }

  console.log("\nLive verification");
  console.log(`  Scott archive questions: ${imported.length}`);
  console.log(`  Active Scott questions:  ${imported.filter((row) => row.status === "published").length}`);
  console.log(`  Draft Scott questions:   ${imported.filter((row) => row.status !== "published").length}`);
  console.log(`  Figures linked:          ${imported.filter((row) => row.figure_url).length}`);
}

async function main(): Promise<void> {
  const resolvedArchive = path.resolve(archivePath);
  console.log(`Reading ${resolvedArchive}…`);
  const parsed = await parseArchive(resolvedArchive);
  printAudit(parsed);
  validateQuestions(parsed.questions);
  console.log("\nValidation passed: every item has taxonomy, passage, prompt, four choices, and an answer key; incomplete source items will remain drafts.");

  if (!write) {
    console.log("\n[dry-run] No files were uploaded and no database rows were written.");
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required for --write.");
  }
  const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

  console.log("\nUploading figures…");
  const figureUrls = await uploadFigures(supabase, parsed.questions);
  console.log(`  ${figureUrls.size} unique figures uploaded`);

  const updatedAt = new Date().toISOString();
  const rows = parsed.questions.map((question) => toRow(question, figureUrls, updatedAt));
  console.log("Writing questions…");
  await upsertBatches(supabase, rows);

  const catalogAvailable = await allowlistQuestions(supabase, rows);
  console.log(catalogAvailable
    ? "  Question Bank catalog allowlist updated"
    : "  Catalog migration is not deployed; source-filtered fallback remains active");

  await verifyLiveRows(supabase, rows);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
