import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { deleteCourse, saveCourse } from "@/lib/courses/queries";
import type { CourseInput } from "@/lib/courses/types";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Context) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  const input = (await request.json()) as CourseInput;
  if (input.id !== id || !input.title?.trim() || !input.slug?.trim()) return NextResponse.json({ error: "invalid_course" }, { status: 400 });
  const moduleSlugs = input.modules.map((courseModule) => courseModule.slug);
  const lessons = input.modules.flatMap((courseModule) => courseModule.lessons);
  const lessonSlugs = lessons.map((lesson) => lesson.slug);
  if (new Set(moduleSlugs).size !== moduleSlugs.length || new Set(lessonSlugs).size !== lessonSlugs.length) {
    return NextResponse.json({ error: "duplicate_slug" }, { status: 400 });
  }
  const ok = await saveCourse(input);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "save_failed" }, { status: 500 });
}

export async function DELETE(_request: NextRequest, context: Context) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  return (await deleteCourse(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "delete_failed" }, { status: 500 });
}
