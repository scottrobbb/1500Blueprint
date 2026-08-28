import "server-only";

import { supabaseAdmin } from "@/utils/supabase/admin";
import { signCourseAssetReferences } from "@/lib/courses/assets.server";
import {
  canAccessPublication,
  isMissingPublicationStatusColumn,
  legacyPublicationStatus,
  type PublicationStatus,
} from "@/lib/flags";
import type {
  ChoiceId,
  Difficulty,
  Domain,
  GridInQuestion,
  ModuleVariant,
  MultipleChoiceQuestion,
  PracticeTest,
  Question,
  Section,
  SectionId,
  TestModule,
} from "./types";

// Shapes returned by the nested PostgREST select (snake_case columns).
type ChoiceRow = { letter: string; text: string; explanation: string | null };
type QuestionRow = {
  id: string;
  position: number;
  type: "mc" | "grid";
  domain: string | null;
  skill: string | null;
  difficulty: string | null;
  passage: string | null;
  prompt: string;
  figure_url: string | null;
  correct: string | null;
  accepted_answers: string[] | null;
  explanation: string | null;
  choices: ChoiceRow[];
};
type ModuleRow = {
  id: string;
  section: string;
  order: number;
  variant: string;
  minutes_per_module: number;
  questions: QuestionRow[];
};
type TestRow = {
  id: string;
  title: string;
  break_minutes: number;
  rw_threshold: number;
  math_threshold: number;
  modules: ModuleRow[];
  status: string;
};

type TestLoadOptions = { includeDraft?: boolean };

const SECTION_NAME: Record<SectionId, string> = {
  rw: "Reading and Writing",
  math: "Math",
};

const TEST_CONTENT_SELECT =
  "id,title,break_minutes,rw_threshold,math_threshold," +
  "modules(id,section,order,variant,minutes_per_module," +
  "questions(id,position,type,domain,skill,difficulty,passage,prompt,figure_url,correct,accepted_answers,explanation," +
  "choices(letter,text,explanation)))";

function buildQuestion(q: QuestionRow): Question {
  const base = {
    id: q.id,
    domain: (q.domain ?? "") as Domain,
    skill: q.skill ?? undefined,
    difficulty: (q.difficulty ?? "medium") as Difficulty,
    passage: q.passage ?? undefined,
    figureUrl: q.figure_url ?? undefined,
    prompt: q.prompt,
    explanation: q.explanation ?? "",
  };
  if (q.type === "grid") {
    return { ...base, type: "grid", acceptedAnswers: q.accepted_answers ?? [] } satisfies GridInQuestion;
  }
  const sorted = [...q.choices].sort((a, b) => a.letter.localeCompare(b.letter));
  const choiceExplanations: Partial<Record<ChoiceId, string>> = {};
  for (const c of q.choices) if (c.explanation) choiceExplanations[c.letter as ChoiceId] = c.explanation;
  return {
    ...base,
    type: "mc",
    choices: sorted.map((c) => ({ id: c.letter as ChoiceId, text: c.text })),
    correct: (q.correct ?? "A") as ChoiceId,
    choiceExplanations,
  } satisfies MultipleChoiceQuestion;
}

function buildModule(m: ModuleRow): TestModule {
  return {
    id: m.id,
    order: m.order as 1 | 2,
    variant: m.variant === "m1" ? undefined : (m.variant as ModuleVariant),
    questions: [...m.questions].sort((a, b) => a.position - b.position).map(buildQuestion),
  };
}

/** Load a test by slug from Supabase and assemble it into the runner's PracticeTest shape. */
export async function loadTest(slug: string, options: TestLoadOptions = {}): Promise<PracticeTest | null> {
  const db = supabaseAdmin();
  let query = db
    .from("tests")
    .select(`${TEST_CONTENT_SELECT},status`)
    .eq("slug", slug);
  if (!options.includeDraft) query = query.eq("status", "published");
  const result = await query.maybeSingle<TestRow>();
  let data = result.data;

  if (result.error) {
    if (!isMissingPublicationStatusColumn(result.error)) {
      throw new Error(`Could not load practice test [${result.error.code}]: ${result.error.message}`);
    }
    const legacyStatus = legacyPublicationStatus("test", slug);
    if (!canAccessPublication(legacyStatus, Boolean(options.includeDraft))) return null;
    const legacy = await db
      .from("tests")
      .select(TEST_CONTENT_SELECT)
      .eq("slug", slug)
      .maybeSingle<Omit<TestRow, "status">>();
    if (legacy.error) {
      throw new Error(`Could not load legacy practice test [${legacy.error.code}]: ${legacy.error.message}`);
    }
    data = legacy.data ? { ...legacy.data, status: legacyStatus } : null;
  }

  if (!data) return null;
  data = await signCourseAssetReferences(data);

  const sections: Section[] = [];
  for (const sid of ["rw", "math"] as SectionId[]) {
    const mods = data.modules.filter((m) => m.section === sid);
    const m1 = mods.find((m) => m.order === 1);
    const easy = mods.find((m) => m.order === 2 && m.variant === "easy");
    const hard = mods.find((m) => m.order === 2 && m.variant === "hard");
    if (!m1 || !easy || !hard) return null; // incomplete test — fall back to the dev fixture
    sections.push({
      id: sid,
      name: SECTION_NAME[sid],
      shortName: SECTION_NAME[sid],
      minutesPerModule: m1.minutes_per_module,
      module1: buildModule(m1),
      module2: { easy: buildModule(easy), hard: buildModule(hard) },
    });
  }

  return {
    id: data.id,
    title: data.title,
    sections,
    routeThreshold: { rw: data.rw_threshold, math: data.math_threshold },
    breakMinutes: data.break_minutes,
  };
}

/** Lightweight list of all tests for the picker (slug + title only, no questions). */
export async function listTests(options: TestLoadOptions = {}): Promise<{ slug: string; title: string; status: PublicationStatus }[]> {
  const db = supabaseAdmin();
  let query = db
    .from("tests")
    .select("slug,title,status");
  if (!options.includeDraft) query = query.eq("status", "published");
  const result = await query.order("slug").returns<{ slug: string; title: string; status: string }[]>();
  if (result.error) {
    if (!isMissingPublicationStatusColumn(result.error)) {
      throw new Error(`Could not list practice tests [${result.error.code}]: ${result.error.message}`);
    }
    const legacy = await db
      .from("tests")
      .select("slug,title")
      .order("slug")
      .returns<{ slug: string; title: string }[]>();
    if (legacy.error) {
      throw new Error(`Could not list legacy practice tests [${legacy.error.code}]: ${legacy.error.message}`);
    }
    return (legacy.data ?? [])
      .map((test) => ({ ...test, status: legacyPublicationStatus("test", test.slug) }))
      .filter((test) => options.includeDraft || test.status === "published");
  }
  return (result.data ?? []).map((test) => ({
    slug: test.slug,
    title: test.title,
    status: test.status === "published" ? "published" : "draft",
  }));
}

// Used by mutation routes that do not otherwise load the test. Keep the admin
// exception explicit so draft QA never weakens the student-facing check.
export async function canAccessPracticeTestPublication(slug: string, isAdmin: boolean): Promise<boolean> {
  const result = await supabaseAdmin()
    .from("tests")
    .select("status")
    .eq("slug", slug)
    .maybeSingle<{ status: string }>();
  if (result.error) {
    if (!isMissingPublicationStatusColumn(result.error)) {
      throw new Error(`Could not load practice-test publication status: ${result.error.message}`);
    }
    const legacy = await supabaseAdmin()
      .from("tests")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle<{ slug: string }>();
    if (legacy.error) throw new Error(`Could not load legacy practice-test publication: ${legacy.error.message}`);
    return Boolean(legacy.data) && canAccessPublication(legacyPublicationStatus("test", slug), isAdmin);
  }
  if (!result.data) return false;
  const status: PublicationStatus = result.data.status === "published" ? "published" : "draft";
  return canAccessPublication(status, isAdmin);
}
