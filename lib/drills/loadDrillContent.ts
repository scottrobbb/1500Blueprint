// Runtime reader for drill content, used by the student-facing players. Paid
// content is read only with the server-side client after the calling page or
// route has enforced session, publication, and plan access.
//
// Note: this intentionally does NOT read drills.grading_prompt — grading runs
// server-side, and Scott's prompts should not ship to the browser.

import "server-only";

import type { Difficulty } from "@/lib/sat/types";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { signCourseAssetReferences } from "@/lib/courses/assets.server";
import {
  canAccessPublication,
  isMissingPublicationStatusColumn,
  legacyPublicationStatus,
  type PublicationStatus,
} from "@/lib/flags";
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
    includeInQuestionBank: false,
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
export async function loadDrillQuestions(
  drillSlug: DrillSlug,
  options: { includeDraftDrill?: boolean } = {},
): Promise<DrillQuestion[]> {
  // Preserve the existing caller contract; draft parent access is authorized
  // separately, while student question rows must still be published.
  void options;
  const rows: QuestionRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("drill_questions")
      .select(
        "id,drill_slug,section,domain,skill,difficulty,answer_type,stem,passage,figure_url,content,explanation,status,created_at,updated_at," +
          "created_by,drill_walkthrough_steps(id,position,kind,text,detail)",
      )
      .eq("drill_slug", drillSlug)
      .eq("status", "published")
      .order("created_at")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`Could not load ${drillSlug} questions [${error.code}]: ${error.message}`);
    }
    const page = (data ?? []) as unknown as QuestionRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return (await signCourseAssetReferences(rows)).map(toQuestion);
}

export async function canAccessDrillPublication(slug: string, isAdmin: boolean): Promise<boolean> {
  const db = supabaseAdmin();
  const result = await db
    .from("drills")
    .select("status")
    .eq("slug", slug)
    .maybeSingle<{ status: string }>();
  if (result.error) {
    if (!isMissingPublicationStatusColumn(result.error)) {
      throw new Error(`Could not load drill publication status: ${result.error.message}`);
    }
    const legacy = await db
      .from("drills")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle<{ slug: string }>();
    if (legacy.error) throw new Error(`Could not load legacy drill publication: ${legacy.error.message}`);
    return Boolean(legacy.data) && canAccessPublication(legacyPublicationStatus("drill", slug), isAdmin);
  }
  if (!result.data) return false;
  const status: PublicationStatus = result.data.status === "published" ? "published" : "draft";
  return canAccessPublication(status, isAdmin);
}
