// Generates one reading passage for the Reading Comprehension Drill. Difficulty
// and read time come from the student's current rung on the level ladder, read
// server-side from the attempt ledger — the browser never says which level it
// is on. The passage text is returned; the core/depth points it will be graded
// against are stored server-side and withheld, so reading the response cannot
// hand a student the answer key.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { drillAllowance } from "@/lib/auth/access-control";
import { canAccessDrillPublication } from "@/lib/drills/loadDrillContent";
import { loadReadingProgress } from "@/lib/drills/progress";
import { readingLevel } from "@/lib/drills/readingLevels";
import {
  buildReadingPassageUser,
  readingPassageSystemPrompt,
  READING_CORE_LABELS,
  READING_DEPTH_LABELS,
  type ReadingPoint,
} from "@/lib/drills/readingGrading";
import { recentPassageTopics, saveGeneratedPassage } from "@/lib/drills/readingPassages.server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { reportServerError } from "@/lib/observability/server";

// Passage quality is the whole drill, so generation runs on a stronger model
// than grading does. One call per attempt, ~350 output tokens.
const MODEL = process.env.READING_PASSAGE_MODEL ?? "claude-sonnet-5";

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

function generationFailure(error: unknown) {
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

// Reads the model's point list, keeping only well-formed entries and holding the
// canonical labels so the feedback list always reads Topic / Main finding / ...
function readPoints(value: unknown, labels: readonly string[]): ReadingPoint[] {
  if (!Array.isArray(value)) return [];
  const out: ReadingPoint[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { label, text } = entry as Record<string, unknown>;
    if (typeof text !== "string" || text.trim().length === 0) continue;
    const fallback = labels[out.length] ?? "Point";
    out.push({
      label: typeof label === "string" && label.trim() ? label.trim() : fallback,
      text: text.trim(),
    });
  }
  return out;
}

function readBody(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function POST() {
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

  if (!(await canAccessDrillPublication("reading", isAdmin))) {
    return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  }

  // Generation is the expensive call, and nothing about it is idempotent, so it
  // gets its own ceiling well above a real practice pace.
  try {
    const burst = await consumeRateLimit("reading-generate", session.email, {
      limit: 40,
      windowSeconds: 60 * 60,
    });
    if (!burst.allowed) {
      return NextResponse.json(
        { error: "You've generated a lot of passages in the last hour. Try again shortly.", code: "rate_limit", resetsAt: burst.resetsAt },
        {
          status: 429,
          headers: {
            "retry-after": String(Math.max(1, Math.ceil((Date.parse(burst.resetsAt) - Date.now()) / 1000))),
          },
        },
      );
    }
  } catch (error) {
    reportServerError("drill.reading.generate_limit_check_failed", error, {
      provider: "supabase",
      route: "/api/drills/reading/passage",
      method: "POST",
    });
    return NextResponse.json(
      { error: "Passage generation is unavailable", code: "quota_unavailable" },
      { status: 503 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Passage generation is not configured" }, { status: 500 });
  }

  let progress: Awaited<ReturnType<typeof loadReadingProgress>>;
  let avoidTopics: string[];
  try {
    [progress, avoidTopics] = await Promise.all([
      loadReadingProgress(session.email),
      recentPassageTopics(session.email),
    ]);
  } catch (error) {
    reportServerError("drill.reading.progress_load_failed", error, {
      provider: "supabase",
      route: "/api/drills/reading/passage",
      method: "POST",
    });
    return NextResponse.json({ error: "Could not load your reading level" }, { status: 503 });
  }

  const level = readingLevel(progress.level);

  let raw: string;
  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: readingPassageSystemPrompt(),
      messages: [
        { role: "user", content: buildReadingPassageUser(level.difficulty, avoidTopics) },
      ],
    });
    raw = collectText(message.content);
  } catch (error) {
    reportServerError("drill.reading.generation_request_failed", generationFailure(error), {
      provider: "anthropic",
      route: "/api/drills/reading/passage",
      method: "POST",
      source: MODEL,
    });
    return NextResponse.json({ error: "Passage generation failed" }, { status: 502 });
  }

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") {
    reportServerError("drill.reading.invalid_generation_response", {
      name: "InvalidModelResponse",
      status: 502,
    }, {
      provider: "anthropic",
      route: "/api/drills/reading/passage",
      method: "POST",
      source: MODEL,
    });
    return NextResponse.json({ error: "Could not read the generated passage" }, { status: 502 });
  }

  const obj = parsed as Record<string, unknown>;
  const body = readBody(obj.body);
  const corePoints = readPoints(obj.corePoints, READING_CORE_LABELS);
  const depthPoints = readPoints(obj.depthPoints, READING_DEPTH_LABELS);

  // A passage with no core points cannot be graded on the main idea, which is
  // the entire point of the drill — fail rather than serve an ungradable read.
  if (body.length === 0 || corePoints.length === 0) {
    reportServerError("drill.reading.incomplete_generation", {
      name: "IncompleteGeneration",
      status: 502,
    }, {
      provider: "anthropic",
      route: "/api/drills/reading/passage",
      method: "POST",
      source: MODEL,
    });
    return NextResponse.json({ error: "Could not read the generated passage" }, { status: 502 });
  }

  let saved: Awaited<ReturnType<typeof saveGeneratedPassage>>;
  try {
    saved = await saveGeneratedPassage(session.email, {
      level: level.level,
      difficulty: level.difficulty,
      readSeconds: level.readSeconds,
      topic: typeof obj.topic === "string" ? obj.topic.trim().slice(0, 120) : "",
      body,
      corePoints,
      depthPoints,
    });
  } catch (error) {
    reportServerError("drill.reading.passage_save_failed", error, {
      provider: "supabase",
      route: "/api/drills/reading/passage",
      method: "POST",
    });
    return NextResponse.json({ error: "Could not start this passage" }, { status: 503 });
  }

  // corePoints / depthPoints are deliberately absent: they are the answer key.
  return NextResponse.json({
    passageId: saved.id,
    body: saved.body,
    readSeconds: saved.readSeconds,
    progress,
  });
}
