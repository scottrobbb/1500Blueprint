import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { gradeCoursePractice, type CoursePracticeAnswer } from "@/lib/courses/practice";
import type { CoursePractice, LessonBlock } from "@/lib/courses/types";
import { supabaseAdmin } from "@/utils/supabase/admin";

type AttemptRequest = {
  lessonId?: string;
  blockId?: string;
  answers?: CoursePracticeAnswer[];
};

function isPractice(value: LessonBlock["content"]["practice"]): value is CoursePractice {
  return Boolean(value && typeof value.title === "string" && Array.isArray(value.questions) && typeof value.passingScore === "number");
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as AttemptRequest | null;
  if (!body?.lessonId || !body.blockId || !Array.isArray(body.answers) || body.answers.length > 200) return NextResponse.json({ error: "invalid_attempt" }, { status: 400 });
  if (body.answers.some((answer) => typeof answer?.questionId !== "string" || typeof answer?.answer !== "string" || answer.answer.length > 1000)) return NextResponse.json({ error: "invalid_answers" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: block } = await db.from("course_lesson_blocks").select("id,lesson_id,kind,content").eq("id", body.blockId).eq("lesson_id", body.lessonId).maybeSingle<{ id: string; lesson_id: string; kind: string; content: LessonBlock["content"] }>();
  if (!block || block.kind !== "practice" || !isPractice(block.content.practice) || block.content.practice.questions.length === 0) return NextResponse.json({ error: "practice_not_found" }, { status: 404 });

  const grade = gradeCoursePractice(block.content.practice, body.answers);
  const { error } = await db.from("course_practice_attempts").insert({
    email: session.email,
    lesson_id: body.lessonId,
    block_id: body.blockId,
    answers: body.answers,
    score: grade.score,
    correct_count: grade.correctCount,
    question_count: grade.questionCount,
    passed: grade.passed,
  });
  if (error) return NextResponse.json({ error: "attempt_not_saved" }, { status: 500 });
  return NextResponse.json(grade);
}
