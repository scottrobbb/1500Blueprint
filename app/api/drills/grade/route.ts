// AI grading endpoint for the explanation drills. The student player (Grammar
// "Explain Your Process") POSTs here; we load the protected grading prompt +
// canonical answer with the service-role client and run Scott's editable prompt
// through Claude. The grading_prompt never ships to the browser, which is why
// grading lives server-side.
//
// Reading recall is NOT graded here: its passages are generated per attempt and
// scored against two weighted tiers of points, which lives in
// app/api/drills/reading/grade.

import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth/session";
import { getDrill, getQuestion } from "@/lib/drills/admin-queries";
import { refundAiSubmission, reserveAiSubmission } from "@/lib/drills/aiQuota";
import { loadGrammarMastery, recordProgress } from "@/lib/drills/progress";
import { awardDrill, getNavStats } from "@/lib/gamification/state";
import type { DrillSlug } from "@/lib/drills/types";
import type { GrammarContent, LetteredChoice, WalkthroughStep } from "@/lib/drills/types";
import { isAdminEmail } from "@/lib/auth/admin";
import { drillAllowance } from "@/lib/auth/access-control";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { reportServerError } from "@/lib/observability/server";

// Per-student grading runs on a cheap, fast model (Haiku 4.5) per the cost
// analysis (~$0.003/grade, well under the $10/student/month cap). Kept separate
// from EXPLAIN_MODEL, which is for one-time import/seed quality. Override via env.
const MODEL = process.env.GRADING_MODEL ?? "claude-haiku-4-5";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_STUDENT_TEXT_LENGTH = 4_000;

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

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = isAdminEmail(session.email);
  if (!isAdmin) {
    const allowance = await drillAllowance(session.email);
    if (!allowance.allowed) {
      const error = allowance.limit === null
        ? "Daily drills are included with Max."
        : allowance.limit === "unlimited"
          ? "Drill access is temporarily limited. Please try again soon."
          : `You have completed all ${allowance.limit} drills included today.`;
      return NextResponse.json({ error, code: "plan_limit", ...allowance }, { status: 402 });
    }
  }

  let body: GradeBody;
  try {
    const value = await readJsonBody(req, MAX_REQUEST_BYTES);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid body");
    body = value as GradeBody;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyTooLargeError ? "Request body is too large" : "Invalid JSON body" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }

  const { drillSlug, questionId, studentText, selectedChoice } = body;
  if (
    typeof drillSlug !== "string"
    || drillSlug.length === 0
    || drillSlug.length > 80
    || typeof questionId !== "string"
    || questionId.length === 0
    || questionId.length > 160
    || typeof studentText !== "string"
    || studentText.trim().length === 0
    || studentText.length > MAX_STUDENT_TEXT_LENGTH
    || (selectedChoice !== undefined && (typeof selectedChoice !== "string" || selectedChoice.length > 20))
  ) {
    return NextResponse.json(
      { error: `drillSlug, questionId, and 1-${MAX_STUDENT_TEXT_LENGTH} characters of studentText are required` },
      { status: 400 },
    );
  }
  const [question, drill] = await Promise.all([getQuestion(questionId), getDrill(drillSlug)]);
  if (!question || !drill) {
    return NextResponse.json({ error: "Question or drill not found" }, { status: 404 });
  }
  if (drill.status !== "published" && !isAdmin) {
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
  } else {
    return NextResponse.json(
      { error: `Drill "${drillSlug}" is not AI-graded` },
      { status: 400 },
    );
  }

  try {
    const burst = await consumeRateLimit("ai-grade", session.email, {
      limit: 12,
      windowSeconds: 60,
    });
    if (!burst.allowed) {
      return NextResponse.json(
        {
          error: "Too many grading requests",
          code: "rate_limit",
          limit: burst.limit,
          used: burst.used,
          resetsAt: burst.resetsAt,
        },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.max(1, Math.ceil((Date.parse(burst.resetsAt) - Date.now()) / 1000))),
          },
        },
      );
    }
  } catch (error) {
    reportServerError("drill.grade.burst_limit_check_failed", error, {
      provider: "supabase",
      route: "/api/drills/grade",
      method: "POST",
    });
    return NextResponse.json(
      { error: "Grading quota is unavailable", code: "quota_unavailable" },
      { status: 503 },
    );
  }

  let quota: Awaited<ReturnType<typeof reserveAiSubmission>>;
  try {
    quota = await reserveAiSubmission(session.email);
  } catch (error) {
    reportServerError("drill.grade.submission_quota_check_failed", error, {
      provider: "supabase",
      route: "/api/drills/grade",
      method: "POST",
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
    reportServerError("drill.grade.provider_request_failed", gradingFailure(error), {
      provider: "anthropic",
      route: "/api/drills/grade",
      method: "POST",
      source: MODEL,
    });
    try {
      await refundAiSubmission(session.email);
    } catch (refundError) {
      reportServerError("drill.grade.submission_quota_refund_failed", refundError, {
        provider: "supabase",
        route: "/api/drills/grade",
        method: "POST",
      });
    }
    return NextResponse.json({ error: "Grading request failed" }, { status: 502 });
  }

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") {
    reportServerError("drill.grade.invalid_provider_response", {
      name: "InvalidModelResponse",
      status: 502,
    }, {
      provider: "anthropic",
      route: "/api/drills/grade",
      method: "POST",
      source: MODEL,
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
    reportServerError("drill.grade.award_failed", e, {
      provider: "supabase",
      route: "/api/drills/grade",
      method: "POST",
    });
  }

  // Track the question as attempted/mastered (score 100 = mastered) so it stops
  // being re-fed and shows up in History. Non-blocking, like the XP award.
  let questionSaved = false;
  try {
    await recordProgress(session.email, {
      drillSlug: drillSlug as DrillSlug,
      questionId,
      score,
      source: "drill",
    });
    questionSaved = true;
  } catch (e) {
    reportServerError("drill.grade.progress_save_failed", e, {
      provider: "supabase",
      route: "/api/drills/grade",
      method: "POST",
    });
  }

  let grammarMastery: Awaited<ReturnType<typeof loadGrammarMastery>> | undefined;
  if (drillSlug === "grammar") {
    try {
      grammarMastery = await loadGrammarMastery(session.email);
    } catch (e) {
      reportServerError("drill.grade.grammar_mastery_load_failed", e, {
        provider: "supabase",
        route: "/api/drills/grade",
        method: "POST",
      });
      attemptSaved = false;
    }
  }

  const saveStatus = { mastery: attemptSaved, question: questionSaved };

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
