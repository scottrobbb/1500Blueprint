// Runtime reader for drill content, used by the student-facing players. Uses
// the publishable (anon) key under RLS, so it only ever sees status='published'
// questions (and their walkthrough steps). Mirrors lib/sat/loadTest.ts.
//
// Note: this intentionally does NOT read drills.grading_prompt — grading runs
// server-side, and Scott's prompts should not ship to the browser.

import type { Difficulty } from "@/lib/sat/types";
import { supabasePublishable } from "@/utils/supabase/publishable";
import type {
  AnswerType,
  DrillContent,
  DrillQuestion,
  DrillSlug,
  QuestionStatus,
  SatSection,
  WalkthroughKind,
  WalkthroughStep,
} from "./types";

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
  created_at: string;
  updated_at: string;
  created_by: string | null;
  drill_walkthrough_steps: StepRow[] | null;
};
type StepRow = { id: string; position: number; kind: string; text: string; detail: string | null };

function toStep(r: StepRow): WalkthroughStep {
  return { id: r.id, position: r.position, kind: r.kind as WalkthroughKind, text: r.text, detail: r.detail ?? undefined };
}

function toQuestion(r: QuestionRow): DrillQuestion {
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
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    walkthrough: (r.drill_walkthrough_steps ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toStep),
  };
}

// Load all published questions for one drill (with their walkthrough steps).
export async function loadDrillQuestions(drillSlug: DrillSlug): Promise<DrillQuestion[]> {
  const rows: QuestionRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabasePublishable()
      .from("drill_questions")
      .select(
        "id,drill_slug,section,domain,skill,difficulty,answer_type,stem,passage,figure_url,content,explanation,status,created_at,updated_at," +
          "created_by,drill_walkthrough_steps(id,position,kind,text,detail)",
      )
      .eq("drill_slug", drillSlug)
      .eq("status", "published")
      .order("created_at")
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`Could not load ${drillSlug} questions [${error.code}]: ${error.message}`);
    }
    const page = (data ?? []) as unknown as QuestionRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.map(toQuestion);
}
