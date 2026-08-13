/**
 * Replace only Practice Test 2's Reading/Writing content from the structured
 * DOCX export of "PV4 Copy-> Blueprint Test #2".
 * Existing module, question, and choice IDs are preserved; Math rows are never written.
 *
 *   npx tsx scripts/import/replace-test2-rw.ts "<rw-only.docx>" [--dry-run] [--cache=<path>]
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  enrichTest6Questions,
  parseTest6Docx,
  TEST6_SKILLS_BY_DOMAIN,
  type Test6Module,
  type Test6ParseResult,
  type Test6Question,
} from "./parse-test6";

function loadEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv(path.resolve(".env.local"));

const args = process.argv.slice(2);
const docxPath = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run");
const cacheArg = args.find((arg) => arg.startsWith("--cache="))?.slice("--cache=".length);

if (!docxPath) {
  console.error('Usage: tsx scripts/import/replace-test2-rw.ts "<rw-only.docx>" [--dry-run] [--cache=<path>]');
  process.exit(1);
}

const slug = "practice-test-2";
const bucket = "figures";
const expectedModuleCounts = new Map([
  ["1:m1", 27],
  ["2:easy", 27],
  ["2:hard", 27],
]);
const allowedReviewNotes: Readonly<Record<string, readonly string[]>> = {
  // The supplied source literally says "DIFFICULTY, TOPIC" for this item.
  "rw/2/hard/22": ["missing difficulty"],
};
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY ?? "";
const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
const model = process.env.TEST6_ENRICH_MODEL ?? "claude-opus-4-8";
const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

type TestRow = {
  id: string;
  slug: string;
  title: string;
  source_file: string | null;
  updated_at: string;
};

type ModuleRow = {
  id: string;
  test_id: string;
  section: string;
  order: number;
  variant: string;
  minutes_per_module: number;
  label: string | null;
};

type QuestionRow = {
  id: string;
  module_id: string;
  position: number;
  type: string;
  domain: string | null;
  skill: string | null;
  difficulty: string | null;
  passage: string | null;
  prompt: string;
  figure_url: string | null;
  correct: string | null;
  accepted_answers: string[];
  explanation: string | null;
  explanation_source: string | null;
  needs_review: boolean;
};

type ChoiceRow = {
  id: string;
  question_id: string;
  letter: string;
  text: string;
  explanation: string | null;
};

type Snapshot = {
  test: TestRow;
  modules: ModuleRow[];
  questions: QuestionRow[];
  choices: ChoiceRow[];
};

type UploadedImage = { url: string };

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parsedModuleKey(testModule: Test6Module): string {
  return `${testModule.order}:${testModule.variant ?? "m1"}`;
}

function rowModuleKey(testModule: ModuleRow): string {
  return `${testModule.order}:${testModule.variant}`;
}

function hasOnlyAllowedReviewNotes(question: Test6Question): boolean {
  const allowed = allowedReviewNotes[question.key];
  return Boolean(
    allowed &&
      question.notes.length === allowed.length &&
      question.notes.every((note) => allowed.includes(note)),
  );
}

function validateSource(result: Test6ParseResult, enriched: boolean): void {
  const errors: string[] = [];
  const questions = result.modules.flatMap((testModule) => testModule.questions);
  const referencedImages = questions.flatMap((question) => (question.figure ? [question.figure] : []));

  if (result.modules.length !== 3) errors.push(`expected 3 R&W modules, found ${result.modules.length}`);
  for (const testModule of result.modules) {
    if (testModule.section !== "rw") errors.push(`${parsedModuleKey(testModule)} is not R&W`);
    const expected = expectedModuleCounts.get(parsedModuleKey(testModule));
    if (!expected) errors.push(`unexpected module ${parsedModuleKey(testModule)}`);
    else if (testModule.questions.length !== expected) {
      errors.push(`${parsedModuleKey(testModule)}: expected ${expected} questions, found ${testModule.questions.length}`);
    }
  }
  for (const key of expectedModuleCounts.keys()) {
    if (!result.modules.some((testModule) => parsedModuleKey(testModule) === key)) {
      errors.push(`missing module ${key}`);
    }
  }
  if (questions.length !== 81) errors.push(`expected 81 questions, found ${questions.length}`);
  if (questions.some((question) => question.type !== "mc" || question.choices.length !== 4)) {
    errors.push("every source question must be four-choice multiple choice");
  }
  if (questions.some((question) => !question.correct)) errors.push("a source question is missing its correct answer");
  if (questions.some((question) => !question.explanation || question.explanationSource !== "human")) {
    errors.push("every source question must have a supplied human explanation");
  }
  const unexpectedReview = questions.filter(
    (question) => question.needsReview && !hasOnlyAllowedReviewNotes(question),
  );
  if (unexpectedReview.length) {
    errors.push(`questions need review: ${unexpectedReview.map((question) => question.key).join(", ")}`);
  }
  if (questions.some((question) => question.choices.some((choice) => /\sX$/.test(choice.text)))) {
    errors.push("a trailing answer marker remains in student-facing choice text");
  }
  for (const name of referencedImages) {
    if (!result.images.has(name)) errors.push(`missing extracted figure ${name}`);
  }
  for (const name of result.images.keys()) {
    if (!referencedImages.includes(name)) errors.push(`unreferenced extracted figure ${name}`);
  }
  if (enriched) {
    for (const question of questions) {
      if (!question.domain || !question.skill || !TEST6_SKILLS_BY_DOMAIN[question.domain]?.includes(question.skill)) {
        errors.push(`invalid taxonomy: ${question.key}`);
      }
    }
  }
  if (errors.length) throw new Error(`Practice Test 2 R&W validation failed:\n- ${errors.join("\n- ")}`);
}

function printReport(result: Test6ParseResult): void {
  const questions = result.modules.flatMap((testModule) => testModule.questions);
  const tableCount = questions.filter((question) =>
    [question.passage, question.prompt, question.explanation].some((value) => value?.includes("@@ROW@@")),
  ).length;
  console.log("\nPractice Test 2 R&W replacement report");
  for (const testModule of result.modules) {
    console.log(`  ${testModule.label.padEnd(38)} ${testModule.questions.length} questions`);
  }
  console.log(`Questions: ${questions.length}`);
  console.log(`Choices: ${questions.reduce((sum, question) => sum + question.choices.length, 0)}`);
  console.log(`Figures: ${questions.filter((question) => question.figure).length}/${result.images.size}`);
  console.log(`Tables: ${tableCount}`);
  console.log(`Human explanations: ${questions.filter((question) => question.explanationSource === "human").length}`);
  console.log(`AI taxonomy tags: ${questions.filter((question) => question.domain && question.skill).length}`);
  console.log(`LaTeX replacements: ${questions.reduce((sum, question) => sum + question.latexReplacementCount, 0)}`);
}

async function ensureBucket(): Promise<void> {
  const { data, error } = await supabase.storage.getBucket(bucket);
  if (error && !/not found/i.test(error.message)) throw error;
  if (data) return;
  const { error: createError } = await supabase.storage.createBucket(bucket, { public: true });
  if (createError && !/already exists/i.test(createError.message)) throw createError;
}

async function uploadImages(images: Test6ParseResult["images"]): Promise<Map<string, UploadedImage>> {
  const uploaded = new Map<string, UploadedImage>();
  for (const [name, image] of images) {
    const hash = sha256(image.buffer);
    const extension = name.split(".").pop() || "png";
    const objectPath = `${slug}/${hash.slice(0, 24)}.${extension}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(objectPath, image.buffer, { contentType: image.contentType, upsert: true });
    if (error) throw error;
    const url = supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`uploaded figure is not publicly readable: ${name}`);
    if (sha256(Buffer.from(await response.arrayBuffer())) !== hash) {
      throw new Error(`uploaded figure bytes do not match the source: ${name}`);
    }
    uploaded.set(name, { url });
  }
  return uploaded;
}

async function loadSnapshot(): Promise<Snapshot> {
  const testResult = await supabase
    .from("tests")
    .select("id,slug,title,source_file,updated_at")
    .eq("slug", slug)
    .single<TestRow>();
  if (testResult.error) throw testResult.error;

  const moduleResult = await supabase
    .from("modules")
    .select("id,test_id,section,order,variant,minutes_per_module,label")
    .eq("test_id", testResult.data.id)
    .order("section")
    .order("order")
    .order("variant")
    .returns<ModuleRow[]>();
  if (moduleResult.error) throw moduleResult.error;

  const questionResult = await supabase
    .from("questions")
    .select("id,module_id,position,type,domain,skill,difficulty,passage,prompt,figure_url,correct,accepted_answers,explanation,explanation_source,needs_review")
    .in("module_id", moduleResult.data.map((testModule) => testModule.id))
    .order("module_id")
    .order("position")
    .returns<QuestionRow[]>();
  if (questionResult.error) throw questionResult.error;

  const choiceResult = await supabase
    .from("choices")
    .select("id,question_id,letter,text,explanation")
    .in("question_id", questionResult.data.map((question) => question.id))
    .order("question_id")
    .order("letter")
    .returns<ChoiceRow[]>();
  if (choiceResult.error) throw choiceResult.error;

  return {
    test: testResult.data,
    modules: moduleResult.data,
    questions: questionResult.data,
    choices: choiceResult.data,
  };
}

function sectionRows(snapshot: Snapshot, section: "rw" | "math") {
  const modules = snapshot.modules.filter((testModule) => testModule.section === section);
  const moduleIds = new Set(modules.map((testModule) => testModule.id));
  const questions = snapshot.questions.filter((question) => moduleIds.has(question.module_id));
  const questionIds = new Set(questions.map((question) => question.id));
  const choices = snapshot.choices.filter((choice) => questionIds.has(choice.question_id));
  return { modules, questions, choices };
}

function sectionDigest(rows: ReturnType<typeof sectionRows>): string {
  return sha256(JSON.stringify({
    modules: [...rows.modules].sort((a, b) => a.id.localeCompare(b.id)),
    questions: [...rows.questions].sort((a, b) => a.id.localeCompare(b.id)),
    choices: [...rows.choices].sort((a, b) => a.id.localeCompare(b.id)),
  }));
}

function imageUrl(question: Test6Question, uploaded: Map<string, UploadedImage>): string | null {
  if (!question.figure) return null;
  const image = uploaded.get(question.figure);
  if (!image) throw new Error(`no uploaded URL for ${question.figure}`);
  return image.url;
}

function buildReplacement(
  result: Test6ParseResult,
  snapshot: Snapshot,
  uploaded: Map<string, UploadedImage>,
): ReturnType<typeof sectionRows> {
  const existing = sectionRows(snapshot, "rw");
  if (existing.modules.length !== 3 || existing.questions.length !== 81 || existing.choices.length !== 324) {
    throw new Error("existing Practice Test 2 R&W rows do not match the required 3/81/324 structure");
  }

  const moduleByKey = new Map(existing.modules.map((testModule) => [rowModuleKey(testModule), testModule]));
  const questionByPosition = new Map(
    existing.questions.map((question) => [`${question.module_id}:${question.position}`, question]),
  );
  const choiceByLetter = new Map(
    existing.choices.map((choice) => [`${choice.question_id}:${choice.letter}`, choice]),
  );

  const modules: ModuleRow[] = [];
  const questions: QuestionRow[] = [];
  const choices: ChoiceRow[] = [];
  for (const parsedModule of result.modules) {
    const existingModule = moduleByKey.get(parsedModuleKey(parsedModule));
    if (!existingModule) throw new Error(`missing existing module ${parsedModuleKey(parsedModule)}`);
    modules.push({ ...existingModule, label: parsedModule.label });

    for (const parsedQuestion of parsedModule.questions) {
      const existingQuestion = questionByPosition.get(`${existingModule.id}:${parsedQuestion.position}`);
      if (!existingQuestion) throw new Error(`missing existing question ${parsedQuestion.key}`);
      questions.push({
        id: existingQuestion.id,
        module_id: existingModule.id,
        position: parsedQuestion.position,
        type: parsedQuestion.type,
        domain: parsedQuestion.domain,
        skill: parsedQuestion.skill,
        difficulty: parsedQuestion.difficulty,
        passage: parsedQuestion.passage,
        prompt: parsedQuestion.prompt,
        figure_url: imageUrl(parsedQuestion, uploaded),
        correct: parsedQuestion.correct,
        accepted_answers: parsedQuestion.acceptedAnswers,
        explanation: parsedQuestion.explanation,
        explanation_source: parsedQuestion.explanationSource,
        needs_review: parsedQuestion.needsReview,
      });
      for (const parsedChoice of parsedQuestion.choices) {
        const existingChoice = choiceByLetter.get(`${existingQuestion.id}:${parsedChoice.letter}`);
        if (!existingChoice) throw new Error(`missing choice ${parsedQuestion.key}/${parsedChoice.letter}`);
        choices.push({
          id: existingChoice.id,
          question_id: existingQuestion.id,
          letter: parsedChoice.letter,
          text: parsedChoice.text,
          explanation: parsedChoice.explanation,
        });
      }
    }
  }
  return { modules, questions, choices };
}

async function upsertRows(table: "modules" | "questions" | "choices", rows: object[], batchSize: number): Promise<void> {
  for (let index = 0; index < rows.length; index += batchSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + batchSize), { onConflict: "id" });
    if (error) throw error;
  }
}

async function writeReplacement(
  rows: ReturnType<typeof sectionRows>,
  sourceFile: string,
  updatedAt: string,
): Promise<void> {
  await upsertRows("modules", rows.modules, 50);
  await upsertRows("questions", rows.questions, 100);
  await upsertRows("choices", rows.choices, 400);
  const { error } = await supabase
    .from("tests")
    .update({ source_file: sourceFile, updated_at: updatedAt })
    .eq("slug", slug);
  if (error) throw error;
}

async function main(): Promise<void> {
  if (!fs.existsSync(docxPath as string)) throw new Error(`DOCX not found: ${docxPath}`);
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is required for validated taxonomy enrichment");

  console.log("Parsing R&W-only source…");
  const result = await parseTest6Docx(docxPath as string, { initialSection: "rw" });
  validateSource(result, false);

  const sourceHash = sha256(fs.readFileSync(docxPath as string)).slice(0, 12);
  const parsedHash = sha256(JSON.stringify(result.modules)).slice(0, 12);
  const cachePath = cacheArg || path.join(os.tmpdir(), `${slug}-rw-${sourceHash}-${parsedHash}-enrichment.json`);
  console.log(`AI-tagging and validating exact LaTeX edits with ${model}…`);
  await enrichTest6Questions(result.modules, {
    apiKey: anthropicKey,
    model,
    cachePath,
    batchSize: 4,
    concurrency: 3,
  });
  validateSource(result, true);
  printReport(result);
  if (dryRun) {
    console.log("[dry-run] Production was not changed.");
    return;
  }
  if (!supabaseUrl || !supabaseSecret) throw new Error("Supabase credentials are required for production writes");

  const before = await loadSnapshot();
  const mathDigest = sectionDigest(sectionRows(before, "math"));
  console.log(`Math safeguard digest: ${mathDigest}`);

  await ensureBucket();
  const uploaded = await uploadImages(result.images);
  const replacement = buildReplacement(result, before, uploaded);
  const expectedRwDigest = sectionDigest(replacement);
  const sourceFile = `R&W: ${path.basename(docxPath as string)}; Math unchanged from ${before.test.source_file ?? "existing source"}`;
  const updatedAt = new Date().toISOString();

  try {
    await writeReplacement(replacement, sourceFile, updatedAt);
    const after = await loadSnapshot();
    if (sectionDigest(sectionRows(after, "math")) !== mathDigest) {
      throw new Error("Math safeguard failed: Math rows changed");
    }
    if (sectionDigest(sectionRows(after, "rw")) !== expectedRwDigest) {
      throw new Error("R&W verification failed: production rows differ from the validated source");
    }
  } catch (error) {
    console.error("Replacement failed; restoring the previous R&W snapshot…");
    try {
      await writeReplacement(
        sectionRows(before, "rw"),
        before.test.source_file ?? "",
        before.test.updated_at,
      );
    } catch (rollbackError) {
      throw new Error(`replacement failed and rollback also failed: ${String(error)}; ${String(rollbackError)}`);
    }
    throw error;
  }

  const questions = result.modules.flatMap((testModule) => testModule.questions);
  const tableCount = questions.filter((question) =>
    [question.passage, question.prompt, question.explanation].some((value) => value?.includes("@@ROW@@")),
  ).length;
  console.log(
    `Imported and verified Practice Test 2 R&W: 3 modules, 81 questions, 324 choices, ` +
      `${result.images.size} figures, ${tableCount} tables.`,
  );
  console.log("Verified: every Math module, question, choice, ID, and content field is unchanged.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
