import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { isQuestionBankRuntimeReady } from "@/lib/question-bank/eligibility";
import { MATH_DOMAINS, questionBankLevel, type QuestionBankLevel } from "@/lib/question-bank/math";
import { READING_WRITING_DOMAINS, READING_WRITING_SKILLS } from "@/lib/question-bank/reading-writing";
import { readJsonBody } from "@/lib/security/request";
import type { Difficulty } from "@/lib/sat/types";
import { reportServerError } from "@/lib/observability/server";

// One-time (re-runnable) setup: assigns question_bank_catalog.access_tier =
// 'free' to the Free plan's curated pool -- 40 easy + 40 medium (spread
// across every skill) + 10 hard (one per skill, first 10 skills) for each
// subject. Challenge-level questions are deliberately never touched here;
// Scott hand-picks those via the "Free tier" checkbox in the question
// editor (a handful of good, non-spoilery samples per subject).
//
// Idempotent: only ever adds to the pool, counting what's already flagged
// free-tier toward each bucket's target. Safe to re-run after adding new
// published content to top up a bucket that fell short the first time.

const EASY_TARGET = 40;
const MEDIUM_TARGET = 40;
const HARD_TARGET = 10;
const HARD_SKILL_LIMIT = 10;

type QuestionRow = {
  id: string;
  domain: string | null;
  skill: string | null;
  difficulty: string;
  answer_type: string;
  stem: string | null;
  passage: string | null;
  content: Record<string, unknown> | null;
  created_at: string;
  access_tier: string;
};

type SkillRow = { domain: string; name: string; sort: number };

type SubjectConfig = {
  key: "math" | "rw";
  drillSlug: string;
  section: string;
  answerTypes: string[];
  domainOrder: readonly string[];
  skillOrder?: readonly string[];
};

const SUBJECTS: SubjectConfig[] = [
  {
    key: "math",
    drillSlug: "targeted-math",
    section: "math",
    answerTypes: ["mc_single", "grid_in"],
    domainOrder: MATH_DOMAINS,
  },
  {
    key: "rw",
    drillSlug: "grammar",
    section: "rw",
    answerTypes: ["mc_single"],
    domainOrder: READING_WRITING_DOMAINS,
    skillOrder: READING_WRITING_SKILLS,
  },
];

type SubjectResult = {
  subject: "math" | "rw";
  skillsConsidered: number;
  before: Record<QuestionBankLevel, number>;
  added: Record<"easy" | "medium" | "hard", number>;
  addedQuestionIds: string[];
  after: Record<QuestionBankLevel, number>;
};

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await readJsonBody(req, 1024).catch(() => null)) as { dryRun?: unknown } | null;
  // Defaults to a preview -- a real write requires explicitly passing
  // { "dryRun": false } so an empty/bodyless POST can never mutate data.
  const dryRun = body?.dryRun !== false;

  try {
    const results: SubjectResult[] = [];
    for (const subject of SUBJECTS) {
      results.push(await processSubject(subject, dryRun));
    }
    return NextResponse.json({ dryRun, results });
  } catch (error) {
    reportServerError("admin.question_bank.assign_free_tier_failed", error, {
      provider: "supabase",
      route: "/admin/api/question-bank/assign-free-tier",
      method: "POST",
    });
    return NextResponse.json({ error: "Could not assign the free-tier pool." }, { status: 500 });
  }
}

async function processSubject(subject: SubjectConfig, dryRun: boolean): Promise<SubjectResult> {
  const db = supabaseAdmin();

  const [questions, skills] = await Promise.all([
    loadEligibleQuestions(subject),
    loadSkillOrder(subject),
  ]);

  const skillOrder = subject.skillOrder
    ? [...subject.skillOrder]
    : skills
        .slice()
        .sort((a, b) => {
          const domainOrder = subject.domainOrder.indexOf(a.domain) - subject.domainOrder.indexOf(b.domain);
          return domainOrder || a.sort - b.sort;
        })
        .map((skill) => skill.name);

  const byLevel = new Map<QuestionBankLevel, QuestionRow[]>();
  for (const question of questions) {
    if (!isDifficulty(question.difficulty)) continue;
    const level = questionBankLevel(question.difficulty, question.content);
    const bucket = byLevel.get(level) ?? [];
    bucket.push(question);
    byLevel.set(level, bucket);
  }

  const before = countByLevel(questions);

  const easyPicks = pickRoundRobin(byLevel.get("easy") ?? [], skillOrder, EASY_TARGET);
  const mediumPicks = pickRoundRobin(byLevel.get("medium") ?? [], skillOrder, MEDIUM_TARGET);
  const hardPicks = pickOnePerSkill(byLevel.get("hard") ?? [], skillOrder, HARD_TARGET, HARD_SKILL_LIMIT);

  const toAssign = [...easyPicks, ...mediumPicks, ...hardPicks];

  if (!dryRun && toAssign.length > 0) {
    for (const idBatch of chunks(toAssign.map((q) => q.id), 200)) {
      const { error } = await db
        .from("question_bank_catalog")
        .update({ access_tier: "free" })
        .in("question_id", idBatch);
      if (error) throw new Error(`Could not update question_bank_catalog: ${error.message}`);
    }
  }

  const assignedIds = new Set(toAssign.map((q) => q.id));
  const afterQuestions = questions.map((q) => (assignedIds.has(q.id) ? { ...q, access_tier: "free" } : q));

  return {
    subject: subject.key,
    skillsConsidered: skillOrder.length,
    before,
    added: { easy: easyPicks.length, medium: mediumPicks.length, hard: hardPicks.length },
    addedQuestionIds: toAssign.map((q) => q.id),
    after: countByLevel(afterQuestions),
  };
}

function countByLevel(questions: QuestionRow[]): Record<QuestionBankLevel, number> {
  const counts: Record<QuestionBankLevel, number> = { easy: 0, medium: 0, hard: 0, challenge: 0 };
  for (const question of questions) {
    if (!isDifficulty(question.difficulty)) continue;
    if (question.access_tier !== "free") continue;
    const level = questionBankLevel(question.difficulty, question.content);
    counts[level] += 1;
  }
  return counts;
}

// Hands out one not-yet-free question per skill per pass, cycling through
// skillOrder, until `target` total free-tier questions exist at this level
// (counting ones already flagged free-tier from a prior run).
function pickRoundRobin(rows: QuestionRow[], skillOrder: string[], target: number): QuestionRow[] {
  const alreadyFree = rows.filter((row) => row.access_tier === "free").length;
  let remaining = target - alreadyFree;
  if (remaining <= 0) return [];

  const bySkill = new Map<string, QuestionRow[]>();
  for (const row of rows) {
    if (row.access_tier === "free" || !row.skill) continue;
    const bucket = bySkill.get(row.skill) ?? [];
    bucket.push(row);
    bySkill.set(row.skill, bucket);
  }
  for (const bucket of bySkill.values()) bucket.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const cursors = new Map<string, number>();
  const picked: QuestionRow[] = [];
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (const skill of skillOrder) {
      if (remaining <= 0) break;
      const bucket = bySkill.get(skill);
      if (!bucket) continue;
      const cursor = cursors.get(skill) ?? 0;
      if (cursor >= bucket.length) continue;
      picked.push(bucket[cursor]);
      cursors.set(skill, cursor + 1);
      remaining -= 1;
      progressed = true;
    }
  }
  return picked;
}

// Ensures up to `skillLimit` distinct skills (in skillOrder) have exactly one
// free-tier question at this level, capped at `target` total, counting
// skills/questions already flagged free-tier from a prior run.
function pickOnePerSkill(
  rows: QuestionRow[],
  skillOrder: string[],
  target: number,
  skillLimit: number,
): QuestionRow[] {
  const bySkill = new Map<string, QuestionRow[]>();
  for (const row of rows) {
    if (!row.skill) continue;
    const bucket = bySkill.get(row.skill) ?? [];
    bucket.push(row);
    bySkill.set(row.skill, bucket);
  }
  for (const bucket of bySkill.values()) bucket.sort((a, b) => a.created_at.localeCompare(b.created_at));

  let totalFree = rows.filter((row) => row.access_tier === "free").length;
  const coveredSkills = new Set(
    rows.filter((row) => row.access_tier === "free" && row.skill).map((row) => row.skill as string),
  );

  const picked: QuestionRow[] = [];
  for (const skill of skillOrder) {
    if (totalFree >= target || coveredSkills.size >= skillLimit) break;
    if (coveredSkills.has(skill)) continue;
    const candidate = (bySkill.get(skill) ?? []).find((row) => row.access_tier !== "free");
    if (!candidate) continue;
    picked.push(candidate);
    coveredSkills.add(skill);
    totalFree += 1;
  }
  return picked;
}

async function loadEligibleQuestions(subject: SubjectConfig): Promise<QuestionRow[]> {
  const db = supabaseAdmin();
  const catalog = await loadEnabledCatalog();
  if (catalog.size === 0) return [];

  const rows: QuestionRow[] = [];
  for (const idBatch of chunks([...catalog.keys()], 100)) {
    const result = await db
      .from("drill_questions")
      .select("id,domain,skill,difficulty,answer_type,stem,passage,content,created_at")
      .in("id", idBatch)
      .eq("status", "published")
      .eq("drill_slug", subject.drillSlug)
      .eq("section", subject.section)
      .in("answer_type", subject.answerTypes)
      .returns<Omit<QuestionRow, "access_tier">[]>();
    if (result.error) throw new Error(`Could not load ${subject.key} questions: ${result.error.message}`);
    rows.push(...(result.data ?? []).map((row) => ({ ...row, access_tier: catalog.get(row.id) ?? "ultimate" })));
  }

  return rows.filter((row) => isQuestionBankRuntimeReady({
    drillSlug: subject.drillSlug,
    section: subject.section,
    answerType: row.answer_type,
    domain: row.domain,
    skill: row.skill,
    difficulty: row.difficulty,
    stem: row.stem,
    passage: row.passage,
    content: row.content,
  }));
}

async function loadEnabledCatalog(): Promise<Map<string, string>> {
  const entries = new Map<string, string>();
  const db = supabaseAdmin();
  for (let offset = 0; ; offset += 1000) {
    const result = await db
      .from("question_bank_catalog")
      .select("question_id,access_tier")
      .eq("enabled", true)
      .order("question_id")
      .range(offset, offset + 999)
      .returns<{ question_id: string; access_tier: string }[]>();
    if (result.error) throw new Error(`Could not load question_bank_catalog: ${result.error.message}`);
    const page = result.data ?? [];
    for (const item of page) entries.set(item.question_id, item.access_tier);
    if (page.length < 1000) break;
  }
  return entries;
}

async function loadSkillOrder(subject: SubjectConfig): Promise<SkillRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("sat_skills")
    .select("domain,name,sort")
    .eq("section", subject.section)
    .returns<SkillRow[]>();
  if (error) throw new Error(`Could not load ${subject.key} skills: ${error.message}`);
  return data ?? [];
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

// Challenge counts as a difficulty so the report's challenge tally stays
// accurate. Free-tier picks are unaffected: they draw only from the easy,
// medium and hard buckets, so a Challenge question is never assigned free --
// it is gated by the challengeQuestions entitlement.
function isDifficulty(value: string): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard" || value === "challenge";
}
