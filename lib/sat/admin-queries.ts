// Server-only data access for the PRACTICE-TEST CMS (admin editor). Every
// function uses the service-role client (bypasses RLS), so this module must
// NEVER be imported into a Client Component. Callers (admin pages + route
// handlers) authorize with getAdminSession() first. Rows are mapped
// snake_case -> camelCase here so the UI only ever sees the typed shapes below.
//
// Fully separate from lib/drills/admin-queries.ts: this operates ONLY on the
// tests/modules/questions/choices tables (supabase/schema.sql). It shares no
// tables, routes, or state with the drill CMS or flashcards.

import { supabaseAdmin } from "@/utils/supabase/admin";
import type { ChoiceId, Difficulty, SectionId } from "./types";
import {
  isMissingPublicationStatusColumn,
  legacyPublicationStatus,
  type PublicationStatus,
} from "@/lib/flags";

// The two practice-test question kinds (types.ts uses these as inline literals
// on its Question union; named here so the admin shapes can reference it).
export type QuestionType = "mc" | "grid";

/* ------------------------------- Row shapes ------------------------------ */
// Snake_case, as returned by PostgREST.

type TestRow = {
  id: string;
  slug: string;
  title: string;
  break_minutes: number;
  rw_threshold: number;
  math_threshold: number;
  source_file: string | null;
  status?: string;
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
  accepted_answers: string[] | null;
  explanation: string | null;
  explanation_source: string | null;
  needs_review: boolean;
};

type ChoiceRow = { id: string; question_id: string; letter: string; text: string; explanation: string | null };

/* ------------------------------ Typed shapes ----------------------------- */

export type AdminChoice = { id: string; letter: ChoiceId; text: string; explanation: string | null };

export type AdminQuestion = {
  id: string;
  moduleId: string;
  position: number;
  type: QuestionType;
  domain: string | null;
  skill: string | null;
  difficulty: Difficulty;
  passage: string | null;
  prompt: string;
  figureUrl: string | null;
  correct: ChoiceId | null;
  acceptedAnswers: string[];
  explanation: string | null;
  explanationSource: string | null;
  needsReview: boolean;
  choices: AdminChoice[];
  // Module context, populated when a question is loaded on its own (editor page).
  context?: ModuleContext;
};

export type ModuleContext = {
  testSlug: string;
  testTitle: string;
  section: SectionId;
  order: 1 | 2;
  variant: string; // 'm1' | 'easy' | 'hard'
  moduleLabel: string; // human label, e.g. "Math — Module 2 (Hard)"
};

export type AdminModule = {
  id: string;
  section: SectionId;
  order: 1 | 2;
  variant: string; // 'm1' | 'easy' | 'hard'
  minutesPerModule: number;
  label: string; // human label
  questions: AdminQuestion[];
};

export type AdminTest = {
  id: string;
  slug: string;
  title: string;
  breakMinutes: number;
  rwThreshold: number;
  mathThreshold: number;
  sourceFile: string | null;
  status: PublicationStatus;
  modules: AdminModule[]; // ordered rw-1, rw-2-easy, rw-2-hard, math-1, math-2-easy, math-2-hard
};

export type AdminTestSummary = {
  slug: string;
  title: string;
  moduleCount: number;
  questionCount: number;
  needsReviewCount: number;
  status: PublicationStatus;
};

/* --------------------------------- Helpers ------------------------------- */

const SECTION_NAME: Record<SectionId, string> = { rw: "Reading and Writing", math: "Math" };

// Stable ordering: rw before math, module 1 before 2, and m1 < easy < hard.
const SECTION_RANK: Record<string, number> = { rw: 0, math: 1 };
const VARIANT_RANK: Record<string, number> = { m1: 0, easy: 1, hard: 2 };

function moduleRank(section: string, order: number, variant: string): number {
  return (SECTION_RANK[section] ?? 9) * 100 + order * 10 + (VARIANT_RANK[variant] ?? 9);
}

// Human label for a module from its raw columns (the DB `label` is the raw
// import header like "RW 2A", which is less clear than this derived label).
function moduleLabel(section: string, order: number, variant: string): string {
  const name = SECTION_NAME[(section as SectionId)] ?? section;
  if (order === 1) return `${name} — Module 1`;
  return `${name} — Module 2 (${variant === "hard" ? "Hard" : "Easy"})`;
}

function toChoice(r: ChoiceRow): AdminChoice {
  return { id: r.id, letter: r.letter as ChoiceId, text: r.text, explanation: r.explanation };
}

function toQuestion(r: QuestionRow, choices: ChoiceRow[] = []): AdminQuestion {
  return {
    id: r.id,
    moduleId: r.module_id,
    position: r.position,
    type: (r.type === "grid" ? "grid" : "mc") as QuestionType,
    domain: r.domain,
    skill: r.skill,
    difficulty: (r.difficulty ?? "medium") as Difficulty,
    passage: r.passage,
    prompt: r.prompt ?? "",
    figureUrl: r.figure_url,
    correct: (r.correct as ChoiceId | null) ?? null,
    acceptedAnswers: r.accepted_answers ?? [],
    explanation: r.explanation,
    explanationSource: r.explanation_source,
    needsReview: r.needs_review,
    choices: choices
      .slice()
      .sort((a, b) => a.letter.localeCompare(b.letter))
      .map(toChoice),
  };
}

/* ----------------------------- Test list + read -------------------------- */

type AdminTestSummaryRow = {
  slug: string;
  title: string;
  status?: string;
  modules: { id: string; questions: { id: string; needs_review: boolean }[] }[];
};

const ADMIN_TEST_SUMMARY_SELECT = "slug,title,modules(id,questions(id,needs_review))";
const ADMIN_TEST_MODULES_SELECT =
  "modules(id,test_id,section,order,variant,minutes_per_module,label," +
  "questions(id,module_id,position,type,domain,skill,difficulty,passage,prompt,figure_url,correct,accepted_answers,explanation,explanation_source,needs_review," +
  "choices(id,question_id,letter,text,explanation)))";
const ADMIN_TEST_DETAIL_SELECT =
  "id,slug,title,break_minutes,rw_threshold,math_threshold,source_file," + ADMIN_TEST_MODULES_SELECT;

function toAdminTestSummary(row: AdminTestSummaryRow): AdminTestSummary {
  const questions = row.modules.flatMap((module) => module.questions ?? []);
  return {
    slug: row.slug,
    title: row.title,
    moduleCount: row.modules.length,
    questionCount: questions.length,
    needsReviewCount: questions.filter((question) => question.needs_review).length,
    status: row.status === "published" || row.status === "draft"
      ? row.status
      : legacyPublicationStatus("test", row.slug),
  };
}

// Lightweight list for the tests index, with per-test question + flagged counts.
export async function listAdminTests(): Promise<AdminTestSummary[]> {
  const admin = supabaseAdmin();
  const result = await admin
    .from("tests")
    .select(`slug,title,status,modules(id,questions(id,needs_review))`)
    .order("slug")
    .returns<AdminTestSummaryRow[]>();

  if (!result.error) return (result.data ?? []).map(toAdminTestSummary);
  if (!isMissingPublicationStatusColumn(result.error)) {
    throw new Error(`listAdminTests failed: ${result.error.message}`);
  }

  const legacyResult = await admin
    .from("tests")
    .select(ADMIN_TEST_SUMMARY_SELECT)
    .order("slug")
    .returns<AdminTestSummaryRow[]>();
  if (legacyResult.error) {
    throw new Error(`listAdminTests legacy fallback failed: ${legacyResult.error.message}`);
  }
  return (legacyResult.data ?? []).map(toAdminTestSummary);
}

// Full test with every module + question + choice, assembled + sorted for the
// admin outline. Mirrors the nested select in loadTest.ts but reads ALL fields
// (needs_review, explanations, etc.) via the service-role client.
export async function getAdminTest(slug: string): Promise<AdminTest | null> {
  const admin = supabaseAdmin();
  const result = await admin
    .from("tests")
    .select(`id,slug,title,break_minutes,rw_threshold,math_threshold,source_file,status,${ADMIN_TEST_MODULES_SELECT}`)
    .eq("slug", slug)
    .maybeSingle<TestRow & { modules: (ModuleRow & { questions: (QuestionRow & { choices: ChoiceRow[] })[] })[] }>();

  let data = result.data;
  if (result.error) {
    if (!isMissingPublicationStatusColumn(result.error)) {
      throw new Error(`getAdminTest failed: ${result.error.message}`);
    }

    const legacyResult = await admin
      .from("tests")
      .select(ADMIN_TEST_DETAIL_SELECT)
      .eq("slug", slug)
      .maybeSingle<TestRow & { modules: (ModuleRow & { questions: (QuestionRow & { choices: ChoiceRow[] })[] })[] }>();
    if (legacyResult.error) {
      throw new Error(`getAdminTest legacy fallback failed: ${legacyResult.error.message}`);
    }
    data = legacyResult.data
      ? { ...legacyResult.data, status: legacyPublicationStatus("test", legacyResult.data.slug) }
      : null;
  }
  if (!data) return null;

  const modules: AdminModule[] = (data.modules ?? [])
    .map((m) => ({
      id: m.id,
      section: (m.section === "math" ? "math" : "rw") as SectionId,
      order: (m.order === 2 ? 2 : 1) as 1 | 2,
      variant: m.variant,
      minutesPerModule: m.minutes_per_module,
      label: moduleLabel(m.section, m.order, m.variant),
      questions: (m.questions ?? [])
        .map((q) => toQuestion(q, q.choices ?? []))
        .sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => moduleRank(a.section, a.order, a.variant) - moduleRank(b.section, b.order, b.variant));

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    breakMinutes: data.break_minutes,
    rwThreshold: data.rw_threshold,
    mathThreshold: data.math_threshold,
    sourceFile: data.source_file,
    status: data.status === "published" || data.status === "draft"
      ? data.status
      : legacyPublicationStatus("test", data.slug),
    modules,
  };
}

/* ----------------------------- Test settings ----------------------------- */

export type TestSettingsUpdate = {
  title?: string;
  breakMinutes?: number;
  rwThreshold?: number;
  mathThreshold?: number;
  status?: PublicationStatus;
};

export class TestPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestPublicationError";
  }
}

export async function updateTestSettings(slug: string, patch: TestSettingsUpdate): Promise<void> {
  if (patch.status === "published") await validateTestForPublication(slug);
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.breakMinutes !== undefined) row.break_minutes = patch.breakMinutes;
  if (patch.rwThreshold !== undefined) row.rw_threshold = patch.rwThreshold;
  if (patch.mathThreshold !== undefined) row.math_threshold = patch.mathThreshold;
  if (patch.status !== undefined) row.status = patch.status;
  const { error } = await supabaseAdmin().from("tests").update(row).eq("slug", slug);
  if (error) throw new Error(`updateTestSettings failed: ${error.message}`);
}

export function testQuestionPublicationIssue(
  question: Pick<AdminQuestion, "type" | "prompt" | "correct" | "acceptedAnswers" | "choices" | "needsReview">,
): string | null {
  if (question.needsReview) return "Clear the Needs review flag.";
  if (!question.prompt.trim()) return "Add a question prompt.";
  if (question.type === "grid") {
    return question.acceptedAnswers.some((answer) => answer.trim() !== "")
      ? null
      : "Add at least one accepted grid-in answer.";
  }
  const choices = question.choices.filter((choice) => choice.text.trim() !== "");
  const letters = new Set(choices.map((choice) => choice.letter));
  if (choices.length !== 4 || letters.size !== 4) return "Add four nonblank choices (A–D).";
  return question.correct && letters.has(question.correct) ? null : "Select a valid correct answer.";
}

export async function validateTestForPublication(slug: string): Promise<void> {
  const test = await getAdminTest(slug);
  if (!test) throw new TestPublicationError("This test no longer exists.");
  const required = [
    ["rw", 1, "m1"],
    ["rw", 2, "easy"],
    ["rw", 2, "hard"],
    ["math", 1, "m1"],
    ["math", 2, "easy"],
    ["math", 2, "hard"],
  ] as const;
  for (const [section, order, variant] of required) {
    const testModule = test.modules.find((candidate) => (
      candidate.section === section
      && candidate.order === order
      && (order === 1 || candidate.variant === variant)
    ));
    const label = `${section === "rw" ? "Reading & Writing" : "Math"} Module ${order}${order === 2 ? ` (${variant})` : ""}`;
    if (!testModule) throw new TestPublicationError(`Cannot publish: ${label} is missing.`);
    if (testModule.questions.length === 0) {
      throw new TestPublicationError(`Cannot publish: ${label} has no questions.`);
    }
    const invalid = testModule.questions.find((question) => testQuestionPublicationIssue(question));
    if (invalid) {
      throw new TestPublicationError(
        `Cannot publish: ${label}, question ${invalid.position}: ${testQuestionPublicationIssue(invalid)}`,
      );
    }
  }
}

async function testStatusForQuestion(questionId: string): Promise<PublicationStatus | null> {
  const admin = supabaseAdmin();
  const result = await admin
    .from("questions")
    .select("modules(tests(slug,status))")
    .eq("id", questionId)
    .maybeSingle<{
      modules: { tests: { slug: string; status: string } | null } | null;
    }>();
  if (!result.error) {
    const status = result.data?.modules?.tests?.status;
    return status === "published" ? "published" : status === "draft" ? "draft" : null;
  }
  if (!isMissingPublicationStatusColumn(result.error)) {
    throw new Error(`Could not validate parent test publication: ${result.error.message}`);
  }
  const legacy = await admin
    .from("questions")
    .select("modules(tests(slug))")
    .eq("id", questionId)
    .maybeSingle<{ modules: { tests: { slug: string } | null } | null }>();
  if (legacy.error) throw new Error(`Could not validate legacy parent test: ${legacy.error.message}`);
  const slug = legacy.data?.modules?.tests?.slug;
  return slug ? legacyPublicationStatus("test", slug) : null;
}

/* ------------------------------ Single question -------------------------- */

// One question with its choices AND its module/test context (for the editor
// breadcrumb + directions preview). The context comes from the embedded module
// -> test join on the questions.module_id foreign key.
export async function getAdminQuestion(id: string): Promise<AdminQuestion | null> {
  const { data, error } = await supabaseAdmin()
    .from("questions")
    .select(
      "id,module_id,position,type,domain,skill,difficulty,passage,prompt,figure_url,correct,accepted_answers,explanation,explanation_source,needs_review," +
        "choices(id,question_id,letter,text,explanation)," +
        "modules(section,order,variant,tests(slug,title))",
    )
    .eq("id", id)
    .maybeSingle<
      QuestionRow & {
        choices: ChoiceRow[];
        modules: { section: string; order: number; variant: string; tests: { slug: string; title: string } | null } | null;
      }
    >();

  if (error || !data) return null;

  const q = toQuestion(data, data.choices ?? []);
  const m = data.modules;
  if (m) {
    q.context = {
      testSlug: m.tests?.slug ?? "",
      testTitle: m.tests?.title ?? "",
      section: (m.section === "math" ? "math" : "rw") as SectionId,
      order: (m.order === 2 ? 2 : 1) as 1 | 2,
      variant: m.variant,
      moduleLabel: moduleLabel(m.section, m.order, m.variant),
    };
  }
  return q;
}

// The editor's Next button follows the same stable module/question order as
// the test outline, including moving from the last question in one module to
// the first question in the next module.
export async function getNextAdminQuestionId(testSlug: string, currentId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("tests")
    .select("modules(section,order,variant,questions(id,position))")
    .eq("slug", testSlug)
    .maybeSingle<{
      modules: {
        section: string;
        order: number;
        variant: string;
        questions: { id: string; position: number }[];
      }[];
    }>();

  if (error || !data) return null;

  const orderedIds = (data.modules ?? [])
    .slice()
    .sort((a, b) => moduleRank(a.section, a.order, a.variant) - moduleRank(b.section, b.order, b.variant))
    .flatMap((module) =>
      (module.questions ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((question) => question.id),
    );
  const currentIndex = orderedIds.indexOf(currentId);
  return currentIndex >= 0 ? orderedIds[currentIndex + 1] ?? null : null;
}

/* --------------------------- Create / update / delete -------------------- */

// Append a blank draft question to a module (position = current max + 1) with
// four empty A–D choices, so the editor opens on a valid multiple-choice item.
// Flagged needs_review so it stands out until the admin fills it in.
export async function createTestQuestion(moduleId: string): Promise<AdminQuestion | null> {
  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from("questions")
    .select("position")
    .eq("module_id", moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  const nextPosition = (existing?.position ?? 0) + 1;

  const { data, error } = await admin
    .from("questions")
    .insert({
      module_id: moduleId,
      position: nextPosition,
      type: "mc",
      prompt: "",
      difficulty: "medium",
      accepted_answers: [],
      explanation_source: "human",
      needs_review: true,
    })
    .select("id,module_id,position,type,domain,skill,difficulty,passage,prompt,figure_url,correct,accepted_answers,explanation,explanation_source,needs_review")
    .single<QuestionRow>();
  if (error || !data) return null;

  const letters: ChoiceId[] = ["A", "B", "C", "D"];
  await admin
    .from("choices")
    .insert(letters.map((letter) => ({ question_id: data.id, letter, text: "" })));

  const { data: choices } = await admin
    .from("choices")
    .select("id,question_id,letter,text,explanation")
    .eq("question_id", data.id)
    .returns<ChoiceRow[]>();

  return toQuestion(data, choices ?? []);
}

export type ChoiceInput = { letter: ChoiceId; text: string; explanation: string | null };

export type QuestionInput = {
  id: string;
  type: QuestionType;
  domain: string | null;
  skill: string | null;
  difficulty: Difficulty;
  passage: string | null;
  prompt: string;
  figureUrl: string | null;
  correct: ChoiceId | null;
  acceptedAnswers: string[];
  explanation: string | null;
  explanationSource: string | null;
  needsReview: boolean;
  choices: ChoiceInput[];
};

// Update a question row and REPLACE its choices (delete-all-then-insert, the
// same idempotent cascade-replace the importer uses). Choices are kept even for
// grid-in items so switching a question back to multiple choice restores them;
// the runtime simply ignores choices on a grid question.
export async function updateTestQuestion(input: QuestionInput): Promise<void> {
  const admin = supabaseAdmin();
  if ((await testStatusForQuestion(input.id)) === "published") {
    const issue = testQuestionPublicationIssue({ ...input, choices: input.choices.map((choice) => ({ id: "", ...choice })) });
    if (issue) throw new TestPublicationError(`Draft the test before saving this incomplete question: ${issue}`);
  }

  const { error: qErr } = await admin
    .from("questions")
    .update({
      type: input.type,
      domain: emptyToNull(input.domain),
      skill: emptyToNull(input.skill),
      difficulty: input.difficulty,
      passage: emptyToNull(input.passage),
      prompt: input.prompt,
      figure_url: emptyToNull(input.figureUrl),
      correct: input.type === "mc" ? input.correct : null,
      accepted_answers: input.type === "grid" ? input.acceptedAnswers : [],
      explanation: emptyToNull(input.explanation),
      explanation_source: emptyToNull(input.explanationSource),
      needs_review: input.needsReview,
    })
    .eq("id", input.id);
  if (qErr) throw new Error(`updateTestQuestion failed: ${qErr.message}`);

  const del = await admin.from("choices").delete().eq("question_id", input.id);
  if (del.error) throw new Error(`updateTestQuestion(choices delete) failed: ${del.error.message}`);

  const rows = input.choices
    .filter((c) => c.letter)
    .map((c) => ({
      question_id: input.id,
      letter: c.letter,
      text: c.text ?? "",
      explanation: emptyToNull(c.explanation),
    }));
  if (rows.length > 0) {
    const ins = await admin.from("choices").insert(rows);
    if (ins.error) throw new Error(`updateTestQuestion(choices insert) failed: ${ins.error.message}`);
  }
}

export async function deleteTestQuestion(id: string): Promise<void> {
  if ((await testStatusForQuestion(id)) === "published") {
    throw new TestPublicationError("Draft the test before deleting one of its questions.");
  }
  const { error } = await supabaseAdmin().from("questions").delete().eq("id", id);
  if (error) throw new Error(`deleteTestQuestion failed: ${error.message}`);
}

// Trim, then treat an empty string as a cleared (null) column.
function emptyToNull(value: string | null): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}
