// Server-only data access for the drill CMS. Every function uses the service-
// role client (bypasses RLS), so this module must NEVER be imported into a
// Client Component. Callers (admin pages + route handlers) authorize with
// getAdminSession() first. Rows are mapped snake_case -> camelCase here so the
// rest of the app only ever sees the typed shapes from ./types.

import { supabaseAdmin } from "@/utils/supabase/admin";
import type { Difficulty } from "@/lib/sat/types";
import type {
  AnswerType,
  DrillCategory,
  DrillConfig,
  DrillContent,
  DrillQuestion,
  DrillSlug,
  QuestionStatus,
  SatSection,
  SatSkill,
  WalkthroughKind,
  WalkthroughStep,
  VocabContent,
} from "./types";
import type { Accent, AiRole } from "./types";
import { buildVocabQuestions, type VocabImportEntry } from "./vocabImport";
import {
  isQuestionBankEligibleShape,
  questionBankPublishabilityIssue,
} from "@/lib/question-bank/eligibility";
import { isMissingPublicationStatusColumn, legacyPublicationStatus } from "@/lib/flags";

// ---- Row shapes (as returned by PostgREST) -------------------------------

type DrillRow = {
  slug: string;
  title: string;
  category: string;
  accent: string;
  uses_ai: boolean;
  ai_role: string;
  answer_types: string[];
  grading_prompt: string | null;
  scoring_config: Record<string, unknown> | null;
  sort: number;
  status: string;
};

type QuestionRow = {
  id: string;
  drill_slug: string;
  section: string | null;
  domain: string | null;
  skill: string | null;
  difficulty: string;
  answer_type: string;
  stem: string | null;
  passage: string | null;
  figure_url: string | null;
  content: Record<string, unknown> | null;
  explanation: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  question_bank_catalog?: { enabled: boolean; access_tier: string }[] | { enabled: boolean; access_tier: string } | null;
};

type StepRow = {
  id: string;
  question_id: string;
  position: number;
  kind: string;
  text: string;
  detail: string | null;
};

type SkillRow = { id: string; section: string; domain: string; name: string; sort: number };

const DRILL_SELECT =
  "slug,title,category,accent,uses_ai,ai_role,answer_types,grading_prompt,scoring_config,sort";

// ---- Mappers --------------------------------------------------------------

function toDrill(r: DrillRow): DrillConfig {
  return {
    slug: r.slug as DrillSlug,
    title: r.title,
    category: r.category as DrillCategory,
    accent: r.accent as Accent,
    usesAi: r.uses_ai,
    aiRole: r.ai_role as AiRole,
    answerTypes: (r.answer_types ?? []) as AnswerType[],
    gradingPrompt: r.grading_prompt,
    scoringConfig: r.scoring_config ?? {},
    status: r.status === "published" ? "published" : "draft",
  };
}

function toStep(r: StepRow): WalkthroughStep {
  return {
    id: r.id,
    position: r.position,
    kind: r.kind as WalkthroughKind,
    text: r.text,
    detail: r.detail ?? undefined,
  };
}

function toQuestion(r: QuestionRow, steps: StepRow[] = []): DrillQuestion {
  const catalog = r.question_bank_catalog;
  return {
    id: r.id,
    drillSlug: r.drill_slug as DrillSlug,
    section: (r.section as SatSection | null) ?? null,
    domain: r.domain,
    skill: r.skill,
    difficulty: (r.difficulty ?? "medium") as Difficulty,
    answerType: r.answer_type as AnswerType,
    stem: r.stem,
    passage: r.passage,
    figureUrl: r.figure_url,
    content: (r.content ?? {}) as DrillContent,
    explanation: r.explanation,
    status: r.status as QuestionStatus,
    includeInQuestionBank: Array.isArray(catalog)
      ? catalog.some((entry) => entry.enabled)
      : Boolean(catalog?.enabled),
    questionBankFreeTier: Array.isArray(catalog)
      ? catalog.some((entry) => entry.access_tier === "free")
      : catalog?.access_tier === "free",
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    walkthrough: steps
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toStep),
  };
}

function toSkill(r: SkillRow): SatSkill {
  return { id: r.id, section: r.section as SatSection, domain: r.domain, name: r.name, sort: r.sort };
}

// ---- Reference data -------------------------------------------------------

export async function listSkills(): Promise<SatSkill[]> {
  const { data, error } = await supabaseAdmin()
    .from("sat_skills")
    .select("id,section,domain,name,sort")
    .order("section")
    .order("domain")
    .order("sort");
  if (error || !data) return [];
  return (data as SkillRow[]).map(toSkill);
}

export async function listDrills(): Promise<DrillConfig[]> {
  const db = supabaseAdmin();
  const result = await db
    .from("drills")
    .select(`${DRILL_SELECT},status`)
    .order("sort");
  if (result.error) {
    if (!isMissingPublicationStatusColumn(result.error)) {
      throw new Error(`Could not list drills: ${result.error.message}`);
    }
    const legacy = await db
      .from("drills")
      .select(DRILL_SELECT)
      .order("sort")
      .returns<Omit<DrillRow, "status">[]>();
    if (legacy.error) throw new Error(`Could not list legacy drills: ${legacy.error.message}`);
    return (legacy.data ?? []).map((drill) => toDrill({
      ...drill,
      status: legacyPublicationStatus("drill", drill.slug),
    }));
  }
  return ((result.data ?? []) as DrillRow[]).map(toDrill);
}

export async function getDrill(slug: string): Promise<DrillConfig | null> {
  const db = supabaseAdmin();
  const result = await db
    .from("drills")
    .select(`${DRILL_SELECT},status`)
    .eq("slug", slug)
    .maybeSingle<DrillRow>();
  if (result.error) {
    if (!isMissingPublicationStatusColumn(result.error)) {
      throw new Error(`Could not load drill: ${result.error.message}`);
    }
    const legacy = await db
      .from("drills")
      .select(DRILL_SELECT)
      .eq("slug", slug)
      .maybeSingle<Omit<DrillRow, "status">>();
    if (legacy.error) throw new Error(`Could not load legacy drill: ${legacy.error.message}`);
    return legacy.data ? toDrill({
      ...legacy.data,
      status: legacyPublicationStatus("drill", slug),
    }) : null;
  }
  return result.data ? toDrill(result.data) : null;
}

export type DrillUpdate = {
  title?: string;
  category?: DrillCategory;
  accent?: Accent;
  gradingPrompt?: string | null;
  scoringConfig?: Record<string, unknown>;
  status?: QuestionStatus;
};

export class ContentPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentPublicationError";
  }
}

const CONTENT_REQUIRED_DRILLS = new Set<DrillSlug>([
  "grammar",
  "reading",
  "targeted-math",
  "vocab",
]);

export async function updateDrill(slug: string, patch: DrillUpdate): Promise<void> {
  if (patch.status === "published" && (slug === "word-scan" || slug === "ai-math")) {
    throw new ContentPublicationError(
      "This drill cannot be published until its generated questions and results are persisted server-side.",
    );
  }
  if (patch.status === "published" && CONTENT_REQUIRED_DRILLS.has(slug as DrillSlug)) {
    await validateDrillForPublication(slug as DrillSlug);
  }
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.accent !== undefined) row.accent = patch.accent;
  if (patch.gradingPrompt !== undefined) row.grading_prompt = patch.gradingPrompt;
  if (patch.scoringConfig !== undefined) row.scoring_config = patch.scoringConfig;
  if (patch.status !== undefined) row.status = patch.status;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabaseAdmin().from("drills").update(row).eq("slug", slug);
  if (error) throw new Error(`updateDrill failed: ${error.message}`);
}

// ---- Question bank list (filters + pagination) ----------------------------

export type QuestionFilters = {
  drillSlug?: DrillSlug;
  difficulty?: Difficulty | "challenge";
  answerType?: AnswerType;
  status?: QuestionStatus;
  section?: SatSection;
  skill?: string;
  search?: string;
};

export type QuestionListResult = { questions: DrillQuestion[]; total: number };

export async function listQuestions(
  filters: QuestionFilters = {},
  page = 1,
  pageSize = 25,
): Promise<QuestionListResult> {
  let query = supabaseAdmin()
    .from("drill_questions")
    .select(
      "id,drill_slug,section,domain,skill,difficulty,answer_type,stem,passage,figure_url,content,explanation,status,created_by,created_at,updated_at,question_bank_catalog(enabled,access_tier)",
      { count: "exact" },
    );

  if (filters.drillSlug) query = query.eq("drill_slug", filters.drillSlug);
  if (filters.difficulty === "challenge") {
    // Challenge isn't a stored difficulty -- it's a "hard" question whose
    // content.source names a Challenge archive (see questionBankLevel in
    // lib/question-bank/math.ts). Keep this ilike pattern in sync with that
    // function's /challenge/i regex.
    query = query
      .eq("difficulty", "hard")
      .or("content->source->>archivePath.ilike.%challenge%,content->source->>document.ilike.%challenge%");
  } else if (filters.difficulty) {
    query = query.eq("difficulty", filters.difficulty);
  }
  if (filters.answerType) query = query.eq("answer_type", filters.answerType);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.section) query = query.eq("section", filters.section);
  if (filters.skill) query = query.eq("skill", filters.skill);
  if (filters.search) {
    // Strip PostgREST logic-tree metacharacters so a search term can't break out
    // of the ilike value in the .or() expression (%, comma, parens, star).
    const s = filters.search.replace(/[%,()*]/g, " ").trim();
    if (s) query = query.or(`stem.ilike.%${s}%,passage.ilike.%${s}%`);
  }

  const from = (Math.max(1, page) - 1) * pageSize;
  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .order("id")
    .range(from, from + pageSize - 1);

  if (error) throw new Error(`Could not list drill questions: ${error.message}`);
  if (!data) return { questions: [], total: 0 };
  return { questions: (data as QuestionRow[]).map((r) => toQuestion(r)), total: count ?? 0 };
}

// ---- Single question (with walkthrough) -----------------------------------

export async function getQuestion(id: string): Promise<DrillQuestion | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("drill_questions")
    .select(
      "id,drill_slug,section,domain,skill,difficulty,answer_type,stem,passage,figure_url,content,explanation,status,created_by,created_at,updated_at,question_bank_catalog(enabled,access_tier)",
    )
    .eq("id", id)
    .maybeSingle<QuestionRow>();
  if (error || !data) return null;

  const { data: steps } = await admin
    .from("drill_walkthrough_steps")
    .select("id,question_id,position,kind,text,detail")
    .eq("question_id", id)
    .order("position");

  return toQuestion(data, (steps as StepRow[] | null) ?? []);
}

// ---- Create / update / delete ---------------------------------------------

// Insert a blank draft for a drill and return it. answer_type defaults to the
// drill's first allowed type so the editor opens on a valid item.
export async function createQuestion(
  drillSlug: DrillSlug,
  createdBy: string | null,
): Promise<DrillQuestion | null> {
  const drill = await getDrill(drillSlug);
  const answerType = (drill?.answerTypes[0] ?? "mc_single") as AnswerType;
  const { data, error } = await supabaseAdmin()
    .from("drill_questions")
    .insert({ drill_slug: drillSlug, answer_type: answerType, status: "draft", created_by: createdBy })
    .select(
      "id,drill_slug,section,domain,skill,difficulty,answer_type,stem,passage,figure_url,content,explanation,status,created_by,created_at,updated_at,question_bank_catalog(enabled,access_tier)",
    )
    .single<QuestionRow>();
  if (error || !data) return null;
  return toQuestion(data);
}

export type QuestionInput = {
  id: string;
  section: SatSection | null;
  domain: string | null;
  skill: string | null;
  difficulty: Difficulty;
  answerType: AnswerType;
  stem: string | null;
  passage: string | null;
  figureUrl: string | null;
  content: DrillContent;
  explanation: string | null;
  status: QuestionStatus;
  includeInQuestionBank: boolean;
  questionBankFreeTier: boolean;
};

export async function updateQuestion(input: QuestionInput): Promise<void> {
  const db = supabaseAdmin();
  const question = await db
    .from("drill_questions")
    .select("drill_slug")
    .eq("id", input.id)
    .maybeSingle<{ drill_slug: string }>();
  if (question.error) {
    throw new Error(`updateQuestion(validation) failed: ${question.error.message}`);
  }
  if (!question.data) throw new Error("updateQuestion failed: question not found");
  const drillSlug = question.data.drill_slug as DrillSlug;

  if (input.status === "published") {
    const issue = drillQuestionPublicationIssue(drillSlug, input);
    if (issue) throw new ContentPublicationError(`Cannot publish this question: ${issue}`);
  }
  if (input.includeInQuestionBank) {
    if (!isQuestionBankEligibleShape({
      drillSlug,
      section: input.section,
      answerType: input.answerType,
    })) {
      throw new ContentPublicationError(
        "Only single-choice Grammar Reading & Writing questions and single-choice or grid-in Targeted Math questions can be included in the Question Bank.",
      );
    }
    const issue = questionBankPublishabilityIssue({
      drillSlug,
      section: input.section,
      answerType: input.answerType,
      domain: input.domain,
      skill: input.skill,
      difficulty: input.difficulty,
      stem: input.stem,
      passage: input.passage,
      content: input.content,
    });
    if (issue) throw new ContentPublicationError(`Cannot include this question in the Question Bank: ${issue}`);
  }

  const { error } = await db
    .from("drill_questions")
    .update({
      section: input.section,
      domain: input.domain,
      skill: input.skill,
      difficulty: input.difficulty,
      answer_type: input.answerType,
      stem: input.stem,
      passage: input.passage,
      figure_url: input.figureUrl,
      content: input.content,
      explanation: input.explanation,
      status: input.status,
    })
    .eq("id", input.id);
  if (error) throw new Error(`updateQuestion failed: ${error.message}`);

  const catalogResult = input.includeInQuestionBank
    ? await db.from("question_bank_catalog").upsert(
        { question_id: input.id, access_tier: input.questionBankFreeTier ? "free" : "ultimate", enabled: true },
        { onConflict: "question_id" },
      )
    : await db.from("question_bank_catalog").delete().eq("question_id", input.id);
  if (catalogResult.error) {
    throw new Error(`updateQuestion(question bank) failed: ${catalogResult.error.message}`);
  }
}

function drillQuestionPublicationIssue(
  drillSlug: DrillSlug,
  question: Pick<QuestionInput, "answerType" | "stem" | "passage" | "content">,
): string | null {
  const content = question.content as Record<string, unknown>;
  const prompt = question.stem?.trim() || question.passage?.trim();
  switch (drillSlug) {
    case "grammar":
      if (question.answerType !== "mc_single") return "Grammar requires a multiple-choice answer.";
      if (!question.stem?.trim()) return "Add the question prompt.";
      return multipleChoicePublicationIssue(content);
    case "targeted-math":
      if (!prompt) return "Add the Math question prompt.";
      if (question.answerType === "mc_single") return multipleChoicePublicationIssue(content);
      if (question.answerType !== "grid_in") return "Choose multiple choice or grid-in.";
      return acceptedAnswersIssue(content);
    case "reading": {
      const body = stringArray(content.body);
      const keyPoints = stringArray(content.keyPoints);
      if (body.length === 0) return "Add at least one nonblank passage paragraph.";
      if (keyPoints.length === 0) return "Add at least one grading key point.";
      return null;
    }
    case "vocab": {
      const options = stringArray(content.options);
      const correctIndex = content.correctIndex;
      if (typeof content.definition !== "string" || !content.definition.trim()) return "Add the definition.";
      if (options.length !== 4) return "Add exactly four nonblank word choices.";
      if (!Number.isInteger(correctIndex) || (correctIndex as number) < 0 || (correctIndex as number) >= options.length) {
        return "Choose the correct word.";
      }
      return null;
    }
    case "flashcards":
      return typeof content.word === "string" && content.word.trim()
        && typeof content.definition === "string" && content.definition.trim()
        ? null
        : "Add a word and definition.";
    case "word-scan":
      return stringArray(content.verbs).length > 0 ? null : "Add at least one word to scan.";
    case "ai-math":
      if (!prompt) return "Add the Math question prompt.";
      return question.answerType === "grid_in"
        ? acceptedAnswersIssue(content)
        : multipleChoicePublicationIssue(content);
  }
}

function multipleChoicePublicationIssue(content: Record<string, unknown>): string | null {
  const choices = Array.isArray(content.choices) ? content.choices : [];
  if (choices.length !== 4) return "Add exactly four answer choices (A–D).";
  const ids = new Set<string>();
  for (const choice of choices) {
    if (
      typeof choice !== "object"
      || choice === null
      || !("id" in choice)
      || !("text" in choice)
      || !["A", "B", "C", "D"].includes(String(choice.id))
      || typeof choice.text !== "string"
      || !choice.text.trim()
    ) {
      return "Every A–D choice needs nonblank text.";
    }
    ids.add(String(choice.id));
  }
  if (ids.size !== 4) return "Use each answer label A–D exactly once.";
  return typeof content.correct === "string" && ids.has(content.correct)
    ? null
    : "Select a valid correct answer.";
}

function acceptedAnswersIssue(content: Record<string, unknown>): string | null {
  return stringArray(content.accepted).length > 0
    ? null
    : "Add at least one accepted grid-in answer.";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
}

async function validateDrillForPublication(drillSlug: DrillSlug): Promise<void> {
  const rows: QuestionRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await supabaseAdmin()
      .from("drill_questions")
      .select("id,drill_slug,section,domain,skill,difficulty,answer_type,stem,passage,figure_url,content,explanation,status,created_by,created_at,updated_at")
      .eq("drill_slug", drillSlug)
      .eq("status", "published")
      .order("created_at")
      .order("id")
      .range(from, from + pageSize - 1)
      .returns<QuestionRow[]>();
    if (result.error) {
      throw new Error(`Could not validate drill publication: ${result.error.message}`);
    }
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) break;
  }
  const usable = rows.some((row) => {
    // Multiple-choice Targeted Math rows are valid Question Bank inventory,
    // but the whole-drill player is currently a grid-in experience.
    if (drillSlug === "targeted-math" && row.answer_type !== "grid_in") return false;
    return drillQuestionPublicationIssue(drillSlug, {
      answerType: row.answer_type as AnswerType,
      stem: row.stem,
      passage: row.passage,
      content: (row.content ?? {}) as DrillContent,
    }) === null;
  });
  if (!usable) {
    throw new ContentPublicationError(
      "Cannot publish this drill until it has at least one published, complete question that its player can use.",
    );
  }
}

export type WalkthroughStepInput = {
  position: number;
  kind: WalkthroughKind;
  text: string;
  detail?: string | null;
};

// Replace all steps for a question (delete-all-then-insert), mirroring the
// cascade-replace idempotency the test importer uses for modules.
export async function replaceWalkthrough(
  questionId: string,
  steps: WalkthroughStepInput[],
): Promise<void> {
  const admin = supabaseAdmin();
  const del = await admin.from("drill_walkthrough_steps").delete().eq("question_id", questionId);
  if (del.error) throw new Error(`replaceWalkthrough(delete) failed: ${del.error.message}`);
  if (steps.length === 0) return;
  const rows = steps.map((s, i) => ({
    question_id: questionId,
    position: s.position ?? i + 1,
    kind: s.kind,
    text: s.text,
    detail: s.detail ?? null,
  }));
  const ins = await admin.from("drill_walkthrough_steps").insert(rows);
  if (ins.error) throw new Error(`replaceWalkthrough(insert) failed: ${ins.error.message}`);
}

export class QuestionHasHistoryError extends Error {
  constructor() {
    super("Questions with student attempt or mastery history must be unpublished instead of deleted.");
    this.name = "QuestionHasHistoryError";
  }
}

export async function deleteQuestion(id: string): Promise<void> {
  const db = supabaseAdmin();
  const progress = await db
    .from("drill_question_progress")
    .select("question_id")
    .eq("question_id", id)
    .limit(1);
  if (progress.error) throw new Error(`deleteQuestion(history check) failed: ${progress.error.message}`);
  if ((progress.data?.length ?? 0) > 0) throw new QuestionHasHistoryError();

  const { error } = await db.from("drill_questions").delete().eq("id", id);
  if (error?.code === "23503") throw new QuestionHasHistoryError();
  if (error) throw new Error(`deleteQuestion failed: ${error.message}`);
}

export type VocabImportOutcome = {
  imported: number;
  inserted: number;
  updated: number;
};

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

// Bulk-create or refresh vocab questions by their correct word. Imported rows
// are published immediately so a 1,000+ word source can become the live pool
// in one admin operation without creating duplicates on subsequent uploads.
export async function importVocabEntries(
  entries: readonly VocabImportEntry[],
  createdBy: string,
): Promise<VocabImportOutcome> {
  const built = buildVocabQuestions(entries);
  const db = supabaseAdmin();
  const existing: { id: string; content: Record<string, unknown> | null }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("drill_questions")
      .select("id,content")
      .eq("drill_slug", "vocab")
      .order("created_at")
      .order("id")
      .range(from, from + pageSize - 1)
      .returns<{ id: string; content: Record<string, unknown> | null }[]>();
    if (error) throw new Error(`Could not inspect existing vocab words: ${error.message}`);
    existing.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }

  const existingByWord = new Map<string, string>();
  for (const row of existing) {
    const content = (row.content ?? {}) as VocabContent;
    const word = Array.isArray(content.options) ? content.options[content.correctIndex] : undefined;
    if (word) existingByWord.set(word.toLocaleLowerCase(), row.id);
  }

  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  for (const question of built) {
    const content: VocabContent = {
      pos: question.pos,
      definition: question.definition,
      example: question.example,
      options: question.options,
      correctIndex: question.correctIndex,
    };
    const shared = {
      drill_slug: "vocab",
      answer_type: "mc_single",
      difficulty: "medium",
      stem: question.word,
      content,
      status: "published",
    };
    const id = existingByWord.get(question.word.toLocaleLowerCase());
    if (id) updates.push({ id, ...shared });
    else inserts.push({ ...shared, created_by: createdBy });
  }

  for (const batch of chunks(updates, 200)) {
    const { error } = await db.from("drill_questions").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`Could not update vocab questions: ${error.message}`);
  }
  for (const batch of chunks(inserts, 200)) {
    const { error } = await db.from("drill_questions").insert(batch);
    if (error) throw new Error(`Could not insert vocab questions: ${error.message}`);
  }

  return {
    imported: built.length,
    inserted: inserts.length,
    updated: updates.length,
  };
}
