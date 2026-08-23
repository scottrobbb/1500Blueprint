import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { gradeCoursePractice, type CoursePracticeAnswer } from "@/lib/courses/practice";
import { canAccessPublishedCourseLesson } from "@/lib/courses/queries";
import type { CoursePractice, LessonBlock } from "@/lib/courses/types";
import { supabaseAdmin } from "@/utils/supabase/admin";

type AttemptRequest = {
  lessonId?: string;
  blockId?: string;
  answers?: CoursePracticeAnswer[];
  clientToken?: string;
};

type AttemptRow = {
  id: string;
  score: number;
  correct_count: number;
  question_count: number;
  passed: boolean;
  completed_at: string;
};

type AttemptStats = {
  attemptCount: number;
  bestScore: number;
};

function isPractice(value: LessonBlock["content"]["practice"]): value is CoursePractice {
  return Boolean(value && typeof value.title === "string" && Array.isArray(value.questions) && typeof value.passingScore === "number");
}

async function loadPracticeBlock(lessonId: string, blockId: string) {
  const { data, error } = await supabaseAdmin()
    .from("course_lesson_blocks")
    .select("id,lesson_id,kind,content")
    .eq("id", blockId)
    .eq("lesson_id", lessonId)
    .maybeSingle<{ id: string; lesson_id: string; kind: string; content: LessonBlock["content"] }>();
  if (error) throw new Error(`Could not load course practice [${error.code}]: ${error.message}`);
  if (!data || data.kind !== "practice" || !isPractice(data.content.practice) || data.content.practice.questions.length === 0) return null;
  return { ...data, practice: data.content.practice };
}

function attemptJson(row: AttemptRow, stats: AttemptStats) {
  return {
    attemptId: row.id,
    score: row.score,
    correctCount: row.correct_count,
    questionCount: row.question_count,
    passed: row.passed,
    completedAt: row.completed_at,
    ...stats,
    results: {},
  };
}

async function loadAttemptStats(email: string, blockId: string): Promise<AttemptStats> {
  const db = supabaseAdmin();
  const [count, best] = await Promise.all([
    db.from("course_practice_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .eq("block_id", blockId),
    db.from("course_practice_attempts")
      .select("score")
      .eq("email", email)
      .eq("block_id", blockId)
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle<{ score: number }>(),
  ]);
  if (count.error || best.error) throw count.error ?? best.error;
  return { attemptCount: count.count ?? 0, bestScore: best.data?.score ?? 0 };
}

async function requireLessonAccess(email: string, lessonId: string) {
  try {
    return await canAccessPublishedCourseLesson(email, lessonId);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lessonId = request.nextUrl.searchParams.get("lessonId");
  const blockId = request.nextUrl.searchParams.get("blockId");
  if (!lessonId || !blockId) return NextResponse.json({ error: "lessonId and blockId are required" }, { status: 400 });
  const hasAccess = await requireLessonAccess(session.email, lessonId);
  if (hasAccess === null) return NextResponse.json({ error: "course_access_not_loaded" }, { status: 500 });
  if (!hasAccess) return NextResponse.json({ error: "practice_not_found" }, { status: 404 });
  if (!(await loadPracticeBlock(lessonId, blockId))) return NextResponse.json({ error: "practice_not_found" }, { status: 404 });

  const { data, error } = await supabaseAdmin()
    .from("course_practice_attempts")
    .select("id,score,correct_count,question_count,passed,completed_at")
    .eq("email", session.email)
    .eq("lesson_id", lessonId)
    .eq("block_id", blockId)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle<AttemptRow>();
  if (error) return NextResponse.json({ error: "attempt_not_loaded" }, { status: 500 });
  let attempt = null;
  if (data) {
    try {
      attempt = attemptJson(data, await loadAttemptStats(session.email, blockId));
    } catch {
      return NextResponse.json({ error: "attempt_not_loaded" }, { status: 500 });
    }
  }
  return NextResponse.json({ attempt }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as AttemptRequest | null;
  if (
    !body?.lessonId
    || !body.blockId
    || !Array.isArray(body.answers)
    || body.answers.length > 200
    || typeof body.clientToken !== "string"
    || body.clientToken.length < 8
    || body.clientToken.length > 160
  ) return NextResponse.json({ error: "invalid_attempt" }, { status: 400 });
  if (body.answers.some((answer) => typeof answer?.questionId !== "string" || typeof answer?.answer !== "string" || answer.answer.length > 1000)) return NextResponse.json({ error: "invalid_answers" }, { status: 400 });

  const hasAccess = await requireLessonAccess(session.email, body.lessonId);
  if (hasAccess === null) return NextResponse.json({ error: "course_access_not_loaded" }, { status: 500 });
  if (!hasAccess) return NextResponse.json({ error: "practice_not_found" }, { status: 404 });
  const block = await loadPracticeBlock(body.lessonId, body.blockId);
  if (!block) return NextResponse.json({ error: "practice_not_found" }, { status: 404 });

  const questionIds = new Set(block.practice.questions.map((question) => question.id));
  const answerIds = body.answers.map((answer) => answer.questionId);
  if (answerIds.length !== questionIds.size || new Set(answerIds).size !== answerIds.length || answerIds.some((id) => !questionIds.has(id))) {
    return NextResponse.json({ error: "invalid_answers" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const existing = await db
    .from("course_practice_attempts")
    .select("id,score,correct_count,question_count,passed,completed_at")
    .eq("email", session.email)
    .eq("block_id", body.blockId)
    .eq("client_token", body.clientToken)
    .maybeSingle<AttemptRow>();
  if (existing.error) return NextResponse.json({ error: "attempt_not_loaded" }, { status: 500 });
  if (existing.data) {
    try {
      return NextResponse.json({
        ...attemptJson(existing.data, await loadAttemptStats(session.email, body.blockId)),
        deduped: true,
      });
    } catch {
      return NextResponse.json({ error: "attempt_not_loaded" }, { status: 500 });
    }
  }

  const grade = gradeCoursePractice(block.practice, body.answers);
  const { data, error } = await db.from("course_practice_attempts").insert({
    email: session.email,
    lesson_id: body.lessonId,
    block_id: body.blockId,
    answers: body.answers,
    score: grade.score,
    correct_count: grade.correctCount,
    question_count: grade.questionCount,
    passed: grade.passed,
    client_token: body.clientToken,
  }).select("id,score,correct_count,question_count,passed,completed_at").maybeSingle<AttemptRow>();

  if (error || !data) {
    // A simultaneous retry can lose the pre-read race but win the unique index.
    const retried = await db
      .from("course_practice_attempts")
      .select("id,score,correct_count,question_count,passed,completed_at")
      .eq("email", session.email)
      .eq("block_id", body.blockId)
      .eq("client_token", body.clientToken)
      .maybeSingle<AttemptRow>();
    if (retried.data) {
      try {
        return NextResponse.json({
          ...attemptJson(retried.data, await loadAttemptStats(session.email, body.blockId)),
          deduped: true,
        });
      } catch {
        return NextResponse.json({ error: "attempt_not_loaded" }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "attempt_not_saved" }, { status: 500 });
  }
  try {
    const stats = await loadAttemptStats(session.email, body.blockId);
    return NextResponse.json({ ...grade, ...stats, attemptId: data.id, completedAt: data.completed_at });
  } catch {
    return NextResponse.json({ error: "attempt_not_loaded" }, { status: 500 });
  }
}
