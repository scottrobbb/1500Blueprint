import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { deleteCourse, saveCourse } from "@/lib/courses/queries";
import type { CourseInput } from "@/lib/courses/types";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Context) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  const input = (await request.json().catch(() => null)) as CourseInput | null;
  if (!input || input.id !== id || !input.title?.trim() || !input.slug?.trim() || !Array.isArray(input.modules)) return NextResponse.json({ error: "invalid_course", detail: "The course title, slug, and module list are required." }, { status: 400 });
  if (JSON.stringify(input).length > 10_000_000) return NextResponse.json({ error: "course_too_large", detail: "This course is too large to save in one request." }, { status: 413 });
  const moduleSlugs = input.modules.map((courseModule) => courseModule.slug);
  if (new Set(moduleSlugs).size !== moduleSlugs.length) return NextResponse.json({ error: "duplicate_slug", detail: "Every module needs a unique URL slug." }, { status: 400 });
  for (const courseModule of input.modules) {
    if (!courseModule.title?.trim() || !courseModule.slug?.trim() || !Array.isArray(courseModule.lessons)) return NextResponse.json({ error: "invalid_module", detail: "Every module needs a title, slug, and lesson list." }, { status: 400 });
    const lessonSlugs = courseModule.lessons.map((lesson) => lesson.slug);
    if (new Set(lessonSlugs).size !== lessonSlugs.length) return NextResponse.json({ error: "duplicate_slug", detail: `Every lesson inside “${courseModule.title}” needs a unique URL slug.` }, { status: 400 });
    for (const lesson of courseModule.lessons) {
      if (!lesson.title?.trim() || !lesson.slug?.trim() || !Array.isArray(lesson.blocks)) return NextResponse.json({ error: "invalid_lesson", detail: "Every lesson needs a title, slug, and content list." }, { status: 400 });
      for (const block of lesson.blocks) {
        if (!block.id || !["text", "video", "image", "file", "practice"].includes(block.kind)) return NextResponse.json({ error: "invalid_block", detail: `“${lesson.title}” contains an invalid content block.` }, { status: 400 });
        if (block.kind === "practice") {
          const practice = block.content.practice;
          if (!practice || !Array.isArray(practice.questions) || practice.questions.length > 500 || practice.passingScore < 0 || practice.passingScore > 100) return NextResponse.json({ error: "invalid_practice", detail: `The practice inside “${lesson.title}” has invalid settings.` }, { status: 400 });
          if (practice.questions.some((question) => !question.id || !["multiple_choice", "free_response"].includes(question.type) || !Array.isArray(question.choices))) return NextResponse.json({ error: "invalid_practice_question", detail: `The practice inside “${lesson.title}” contains an invalid question.` }, { status: 400 });
        }
      }
    }
  }
  const ok = await saveCourse(input);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "save_failed" }, { status: 500 });
}

export async function DELETE(_request: NextRequest, context: Context) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  return (await deleteCourse(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "delete_failed" }, { status: 500 });
}
