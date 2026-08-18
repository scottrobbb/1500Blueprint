import { supabasePublishable } from "@/utils/supabase/publishable";
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
};

const SECTION_NAME: Record<SectionId, string> = {
  rw: "Reading and Writing",
  math: "Math",
};

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
export async function loadTest(slug: string): Promise<PracticeTest | null> {
  const { data, error } = await supabasePublishable()
    .from("tests")
    .select(
      "id,title,break_minutes,rw_threshold,math_threshold," +
        "modules(id,section,order,variant,minutes_per_module," +
        "questions(id,position,type,domain,skill,difficulty,passage,prompt,figure_url,correct,accepted_answers,explanation," +
        "choices(letter,text,explanation)))",
    )
    .eq("slug", slug)
    .maybeSingle<TestRow>();

  if (error || !data) return null;

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
export async function listTests(): Promise<{ slug: string; title: string }[]> {
  const { data, error } = await supabasePublishable()
    .from("tests")
    .select("slug,title")
    .order("slug");
  if (error || !data) return [];
  return data;
}
