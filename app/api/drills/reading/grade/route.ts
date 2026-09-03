// Grades a from-memory recall of a generated reading passage.
//
// The model only judges how well each core/depth point was recalled; the score
// itself is computed from those judgements in scoreReadingRecall, so the 80/20
// weighting toward main points is exact and identical for every student. The
// passage and its points are re-read from the server-side row by id, never from
// the request, and the row is single-use so a replayed submit cannot pad the
// three-in-a-row streak.

import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { drillAllowance } from "@/lib/auth/access-control";
import { getDrill } from "@/lib/drills/admin-queries";
import { refundAiSubmission, reserveAiSubmission } from "@/lib/drills/aiQuota";
import { loadReadingProgress } from "@/lib/drills/progress";
import { readingLevel } from "@/lib/drills/readingLevels";
import {
  buildReadingGradeUser,
  READING_GRADING_SYSTEM_PROMPT,
  scoreReadingRecall,
  type GradedReadingPoint,
  type ReadingPoint,
  type ReadingRecall,
} from "@/lib/drills/readingGrading";
import { claimPassageForGrading, releasePassageClaim } from "@/lib/drills/readingPassages.server";
import { awardDrill, getNavStats } from "@/lib/gamification/state";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { reportServerError } from "@/lib/observability/server";

const MODEL = process.env.GRADING_MODEL ?? "claude-haiku-4-5";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_STUDENT_TEXT_LENGTH = 4_000;
const ROUTE = { route: "/api/drills/reading/grade", method: "POST" } as const;

type GradeBody = {
  passageId?: string;
  studentText?: string;
};

function collectText(content: Anthropic.Messages.ContentBlock[]): string {
  let text = "";
  for (const block of content) if (block.type === "text") text += block.text;
  return text;
}

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

function gradingFailure(error: unknown) {
  if (error instanceof Anthropic.APIError) {
    return { name: error.name, status: error.status, type: error.type, requestId: error.requestID };
  }
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    status: null,
    type: null,
    requestId: null,
  };
}

function readRecall(value: unknown): ReadingRecall | null {
  return value === "full" || value === "partial" || value === "missed" ? value : null;
}

// Pairs the model's verdicts back to our canonical points by label, falling back
// to position when a label was not echoed. An unmatched point counts as missed —
// never credit a point the grader did not actually rule on.
function attachRecall(
  points: ReadingPoint[],
  tier: GradedReadingPoint["tier"],
  returned: unknown,
): GradedReadingPoint[] {
  const entries = Array.isArray(returned) ? returned : [];
  const byLabel = new Map<string, ReadingRecall>();
  const byIndex: (ReadingRecall | null)[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      byIndex.push(null);
      continue;
    }
    const { label, recall } = entry as Record<string, unknown>;
    const parsed = readRecall(recall);
    byIndex.push(parsed);
    if (parsed && typeof label === "string") byLabel.set(label.trim().toLowerCase(), parsed);
  }
  return points.map((point, i) => ({
    ...point,
    tier,
    recall: byLabel.get(point.label.trim().toLowerCase()) ?? byIndex[i] ?? "missed",
  }));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = session.email;

  const isAdmin = isAdminEmail(email);
  if (!isAdmin) {
    const allowance = await drillAllowance(email);
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

  const { passageId, studentText } = body;
  if (
    typeof passageId !== "string"
    || passageId.length === 0
    || passageId.length > 160
    || typeof studentText !== "string"
    || studentText.trim().length === 0
    || studentText.length > MAX_STUDENT_TEXT_LENGTH
  ) {
    return NextResponse.json(
      { error: `A passage id and 1-${MAX_STUDENT_TEXT_LENGTH} characters of studentText are required` },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Grading is not configured" }, { status: 500 });

  try {
    const burst = await consumeRateLimit("ai-grade", email, { limit: 12, windowSeconds: 60 });
    if (!burst.allowed) {
      return NextResponse.json(
        { error: "Too many grading requests", code: "rate_limit", resetsAt: burst.resetsAt },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.max(1, Math.ceil((Date.parse(burst.resetsAt) - Date.now()) / 1000))),
          },
        },
      );
    }
  } catch (error) {
    reportServerError("drill.reading.grade_limit_check_failed", error, { provider: "supabase", ...ROUTE });
    return NextResponse.json({ error: "Grading quota is unavailable", code: "quota_unavailable" }, { status: 503 });
  }

  let quota: Awaited<ReturnType<typeof reserveAiSubmission>>;
  try {
    quota = await reserveAiSubmission(email);
  } catch (error) {
    reportServerError("drill.reading.submission_quota_check_failed", error, { provider: "supabase", ...ROUTE });
    return NextResponse.json({ error: "Grading quota is unavailable", code: "quota_unavailable" }, { status: 503 });
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

  // Hand the quota back on every path that ends without a grade.
  const refundQuota = async () => {
    try {
      await refundAiSubmission(email);
    } catch (error) {
      reportServerError("drill.reading.submission_quota_refund_failed", error, { provider: "supabase", ...ROUTE });
    }
  };

  let passage: Awaited<ReturnType<typeof claimPassageForGrading>>;
  try {
    passage = await claimPassageForGrading(email, passageId);
  } catch (error) {
    reportServerError("drill.reading.passage_claim_failed", error, { provider: "supabase", ...ROUTE });
    await refundQuota();
    return NextResponse.json({ error: "Could not load this passage" }, { status: 503 });
  }
  if (!passage) {
    await refundQuota();
    return NextResponse.json(
      { error: "This passage has already been graded. Start a new one.", code: "passage_spent" },
      { status: 409 },
    );
  }

  // Undo the single-use claim so a failed grade costs the student nothing but
  // the wait — they can resubmit the summary they already wrote.
  const releaseClaim = async () => {
    try {
      await releasePassageClaim(email, passageId);
    } catch (error) {
      reportServerError("drill.reading.passage_release_failed", error, { provider: "supabase", ...ROUTE });
    }
  };

  // The drill's system prompt stays editable in the CMS; the strict-JSON
  // contract is appended in the user turn, so an edit can never break parsing.
  let system = READING_GRADING_SYSTEM_PROMPT;
  try {
    const drill = await getDrill("reading");
    if (drill?.gradingPrompt) system = drill.gradingPrompt;
  } catch (error) {
    reportServerError("drill.reading.grading_prompt_load_failed", error, { provider: "supabase", ...ROUTE });
  }

  let raw: string;
  try {
    const anthropic = new Anthropic({ apiKey });
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [
        {
          role: "user",
          content: buildReadingGradeUser(passage.body, passage.corePoints, passage.depthPoints, studentText),
        },
      ],
    });
    raw = collectText(resp.content);
  } catch (error) {
    reportServerError("drill.reading.provider_request_failed", gradingFailure(error), {
      provider: "anthropic",
      source: MODEL,
      ...ROUTE,
    });
    await Promise.all([refundQuota(), releaseClaim()]);
    return NextResponse.json({ error: "Grading request failed" }, { status: 502 });
  }

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") {
    reportServerError("drill.reading.invalid_provider_response", { name: "InvalidModelResponse", status: 502 }, {
      provider: "anthropic",
      source: MODEL,
      ...ROUTE,
    });
    await Promise.all([refundQuota(), releaseClaim()]);
    return NextResponse.json({ error: "Could not parse grading response" }, { status: 502 });
  }

  const obj = parsed as Record<string, unknown>;
  const core = attachRecall(passage.corePoints, "core", obj.core);
  const depth = attachRecall(passage.depthPoints, "depth", obj.depth);
  const fabrications = Array.isArray(obj.fabrications)
    ? obj.fabrications.filter((f): f is string => typeof f === "string").slice(0, 6)
    : [];
  const score = scoreReadingRecall(core, depth, fabrications);
  const verdict = typeof obj.verdict === "string" ? obj.verdict : "";
  const passScore = readingLevel(passage.level).passScore;

  // XP is awarded from the server-computed score, and that same write is the
  // attempt ledger the level ladder is replayed from.
  let xpAwarded: number | undefined;
  let attemptSaved = false;
  let nav: Awaited<ReturnType<typeof getNavStats>> | undefined;
  try {
    const award = await awardDrill(email, { drillSlug: "reading", score });
    nav = await getNavStats(email);
    xpAwarded = award.xpAwarded;
    attemptSaved = true;
  } catch (error) {
    reportServerError("drill.reading.award_failed", error, { provider: "supabase", ...ROUTE });
  }

  // Replayed from the ledger, so the level and streak the student sees are the
  // ones that survive a reload. A failed award leaves it unchanged, which is the
  // truth: an attempt that was never recorded did not advance anything.
  let progress: Awaited<ReturnType<typeof loadReadingProgress>> | undefined;
  try {
    progress = await loadReadingProgress(email);
  } catch (error) {
    reportServerError("drill.reading.progress_load_failed", error, { provider: "supabase", ...ROUTE });
  }

  return NextResponse.json({
    score,
    verdict,
    passScore,
    passed: score >= passScore,
    core,
    depth,
    fabrications,
    progress,
    xpAwarded,
    aiUsage: quota,
    saveStatus: { attempt: attemptSaved },
    ...(nav ? { streak: nav.streak, level: nav.level, xp: nav.xp } : {}),
  });
}
