// AI grading endpoint for the explanation/recall drills. The student player
// (Grammar "Explain Your Process", Reading "Your Summary") POSTs here; we load
// the protected grading prompt + canonical answer with the service-role client
// and run Scott's editable prompt through Claude. The grading_prompt never
// ships to the browser, which is why grading lives server-side.

import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth/session";
import { getDrill, getQuestion } from "@/lib/drills/admin-queries";
import { refundAiSubmission, reserveAiSubmission } from "@/lib/drills/aiQuota";
import { loadGrammarMastery, loadReadingProgress, recordProgress } from "@/lib/drills/progress";
import { awardDrill, getNavStats } from "@/lib/gamification/state";
import type { DrillSlug } from "@/lib/drills/types";
import type {
  GrammarContent,
  LetteredChoice,
  ReadingContent,
  WalkthroughStep,
} from "@/lib/drills/types";
import { isAdminEmail } from "@/lib/auth/admin";
import { isDrillUnderConstruction } from "@/lib/flags";
import { drillAllowance } from "@/lib/auth/access-control";

// Per-student grading runs on a cheap, fast model (Haiku 4.5) per the cost
// analysis (~$0.003/grade, well under the $10/student/month cap). Kept separate
// from EXPLAIN_MODEL, which is for one-time import/seed quality. Override via env.
const MODEL = process.env.GRADING_MODEL ?? "claude-haiku-4-5";

type GradeBody = {
  drillSlug?: string;
  questionId?: string;
  studentText?: string;
  selectedChoice?: string;
};

// Pull the first JSON object out of a model response, tolerant of stray prose
// or markdown fences. Mirrors scripts/import/import.ts explain().
function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function collectText(content: Anthropic.Messages.ContentBlock[]): string {
  let text = "";
  for (const block of content) if (block.type === "text") text += block.text;
  return text;
}

function gradingFailure(error: unknown) {
  if (error instanceof Anthropic.APIError) {
    return {
      name: error.name,
      status: error.status,
      type: error.type,
      requestId: error.requestID,
    };
  }
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    status: null,
    type: null,
    requestId: null,
  };
}

// ProcessFeedback shape for the Grammar drill (grade-process).
function buildGrammarUser(
  stem: string | null,
  passage: string | null,
  choices: LetteredChoice[],
  correct: string | undefined,
  walkthrough: WalkthroughStep[],
  selectedChoice: string | undefined,
  studentText: string,
): string {
  const choiceLines = choices.map((c) => `${c.id}. ${c.text}`).join("\n");
  const steps = walkthrough
    .map((s, i) => `${i + 1}. [${s.kind}] ${s.text}${s.detail ? ` — ${s.detail}` : ""}`)
    .join("\n");

  return [
    passage ? `Passage:\n${passage}` : null,
    stem ? `Question:\n${stem}` : null,
    choiceLines ? `Choices:\n${choiceLines}` : null,
    correct ? `Correct answer: ${correct}` : null,
    selectedChoice ? `Student selected: ${selectedChoice}` : null,
    steps ? `Critical-path steps (the ideal reasoning, in order):\n${steps}` : null,
    `Student's explanation:\n${studentText}`,
    'Return strict JSON only: {"score":0-100,"verdict":"<one line>","feedback":"<prose>","stepsMissed":["<step>", ...]}. stepsMissed lists the critical-path steps the explanation failed to show; use [] for a complete explanation.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

// {score,verdict,captured[]} shape for the Reading drill (grade-summary).
function buildReadingUser(
  passageBody: string[],
  keyPoints: string[],
  studentText: string,
): string {
  const passage = passageBody.join("\n\n");
  const points = keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n");

  return [
    `Passage:\n${passage}`,
    `Canonical key points (in order):\n${points}`,
    `Student's summary:\n${studentText}`,
    'Return strict JSON only: {"score":0-100,"verdict":"<one line>","captured":[{"text":"<key point>","captured":true|false}, ...]}. Output one captured entry per provided key point, in the same order, copying each key point text verbatim.',
  ].join("\n\n");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowance = await drillAllowance(session.email);
  if (!allowance.allowed) {
    const error = allowance.limit === null
      ? "Daily drills are included with Core and Max."
      : `You have completed all ${allowance.limit} drills included today.`;
    return NextResponse.json({ error, code: "plan_limit", ...allowance }, { status: 402 });
  }

  let body: GradeBody;
  try {
    body = (await req.json()) as GradeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { drillSlug, questionId, studentText, selectedChoice } = body;
  if (!drillSlug || !questionId || typeof studentText !== "string") {
    return NextResponse.json(
      { error: "drillSlug, questionId, and studentText are required" },
      { status: 400 },
    );
  }
  if (isDrillUnderConstruction(drillSlug) && !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "This drill is under construction." }, { status: 503 });
  }

  const [question, drill] = await Promise.all([getQuestion(questionId), getDrill(drillSlug)]);
  if (!question || !drill) {
    return NextResponse.json({ error: "Question or drill not found" }, { status: 404 });
  }
  // getQuestion uses the service-role client (no RLS), so enforce here that the
  // question belongs to the posted drill AND is published. Same 404 either way
  // so a caller can't probe which check failed or that a draft id exists.
  if (question.drillSlug !== drillSlug || question.status !== "published") {
    return NextResponse.json({ error: "Question or drill not found" }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Grading is not configured" }, { status: 500 });
  }

  const system =
    drill.gradingPrompt ?? "You are an expert digital-SAT tutor grading a student's work.";

  let userPrompt: string;
  if (drill.aiRole === "grade-process") {
    const content = question.content as Partial<GrammarContent>;
    userPrompt = buildGrammarUser(
      question.stem,
      question.passage,
      content.choices ?? [],
      content.correct,
      question.walkthrough ?? [],
      selectedChoice,
      studentText,
    );
  } else if (drill.aiRole === "grade-summary") {
    const content = question.content as Partial<ReadingContent>;
    userPrompt = buildReadingUser(content.body ?? [], content.keyPoints ?? [], studentText);
  } else {
    return NextResponse.json(
      { error: `Drill "${drillSlug}" is not AI-graded` },
      { status: 400 },
    );
  }

  let quota: Awaited<ReturnType<typeof reserveAiSubmission>>;
  try {
    quota = await reserveAiSubmission(session.email);
  } catch (error) {
    console.error("AI submission quota check failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Grading quota is unavailable", code: "quota_unavailable" },
      { status: 503 },
    );
  }

  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "Monthly AI submission limit reached",
        code: "monthly_ai_limit",
        limit: quota.limit,
        used: quota.used,
        resetsAt: quota.resetsAt,
      },
      { status: 429 },
    );
  }

  const anthropic = new Anthropic({ apiKey });
  let raw: string;
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    raw = collectText(resp.content);
  } catch (error) {
    // Keep prompts and student work out of logs while preserving the vendor
    // status/type/request ID needed to distinguish auth, quota, and model errors.
    console.error("Drill grading request failed", {
      model: MODEL,
      ...gradingFailure(error),
    });
    try {
      await refundAiSubmission(session.email);
    } catch (refundError) {
      console.error("AI submission quota refund failed", {
        name: refundError instanceof Error ? refundError.name : "UnknownError",
      });
    }
    return NextResponse.json({ error: "Grading request failed" }, { status: 502 });
  }

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") {
    console.error("Drill grading response was not valid JSON", {
      model: MODEL,
      responseLength: raw.length,
    });
    return NextResponse.json({ error: "Could not parse grading response" }, { status: 502 });
  }

  const obj = parsed as Record<string, unknown>;
  const score = Math.max(0, Math.min(100, Math.round(Number(obj.score) || 0)));
  const verdict = typeof obj.verdict === "string" ? obj.verdict : "";

  // Award XP from the model-computed score — server-side, so the client can't
  // inflate it. Non-blocking: a failure here never blocks the grading feedback.
  let gam: { xpAwarded: number; streak: number; level: number; xp: number } | undefined;
  let attemptSaved = false;
  try {
    const award = await awardDrill(session.email, { drillSlug, score });
    const nav = await getNavStats(session.email);
    gam = { xpAwarded: award.xpAwarded, streak: nav.streak, level: nav.level, xp: nav.xp };
    attemptSaved = true;
  } catch (e) {
    console.error("drill award failed:", e);
  }

  // Track the question as attempted/mastered (score 100 = mastered) so it stops
  // being re-fed and shows up in History. Non-blocking, like the XP award.
  let questionSaved = false;
  try {
    await recordProgress(session.email, { drillSlug: drillSlug as DrillSlug, questionId, score });
    questionSaved = true;
  } catch (e) {
    console.error("drill progress failed:", e);
  }

  let grammarMastery: Awaited<ReturnType<typeof loadGrammarMastery>> | undefined;
  if (drillSlug === "grammar") {
    try {
      grammarMastery = await loadGrammarMastery(session.email);
    } catch (e) {
      console.error("grammar mastery failed:", e);
      attemptSaved = false;
    }
  }

  let readingProgress: Awaited<ReturnType<typeof loadReadingProgress>> | undefined;
  if (drillSlug === "reading" && attemptSaved) {
    try {
      readingProgress = await loadReadingProgress(session.email);
    } catch (e) {
      console.error("reading progress failed:", e);
    }
  }

  const saveStatus = { mastery: attemptSaved, question: questionSaved };

  if (drill.aiRole === "grade-process") {
    const feedback = typeof obj.feedback === "string" ? obj.feedback : "";
    const stepsMissed = Array.isArray(obj.stepsMissed)
      ? obj.stepsMissed.filter((s): s is string => typeof s === "string")
      : [];
    return NextResponse.json({
      score,
      verdict,
      feedback,
      stepsMissed,
      grammarMastery,
      saveStatus,
      aiUsage: quota,
      ...(gam ?? {}),
    });
  }

  // grade-summary: normalize to one entry per provided key point, in order.
  const keyPoints = (question.content as Partial<ReadingContent>).keyPoints ?? [];
  const returned = Array.isArray(obj.captured) ? obj.captured : [];
  // Match the model's entries to our canonical key points by NORMALIZED text, not
  // by position — the model may reorder/paraphrase. Unmatched key points default
  // to not-captured (never pair a key point with an arbitrary positional entry).
  const norm = (s: string) => s.trim().toLowerCase();
  const byText = new Map<string, boolean>();
  for (const entry of returned) {
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      if (typeof e.text === "string") byText.set(norm(e.text), Boolean(e.captured));
    }
  }
  const captured = keyPoints.map((text) => ({ text, captured: byText.get(norm(text)) ?? false }));

  return NextResponse.json({
    score,
    verdict,
    captured,
    readingProgress,
    saveStatus,
    aiUsage: quota,
    ...(gam ?? {}),
  });
}
