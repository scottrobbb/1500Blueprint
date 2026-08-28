import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { deleteCourse, saveCourse } from "@/lib/courses/queries";
import { auditCourse } from "@/lib/courses/audit";
import type { Course, CourseInput } from "@/lib/courses/types";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { isPublicationStatus } from "@/lib/flags";
import { reportServerError } from "@/lib/observability/server";
import { readJsonBody } from "@/lib/security/request";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: Context) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  const input = (await readJsonBody(request, 10_000_000).catch(() => null)) as CourseInput | null;
  if (!input || input.id !== id || !input.title?.trim() || !input.slug?.trim() || !Array.isArray(input.modules) || !isPublicationStatus(input.status)) return NextResponse.json({ error: "invalid_course", detail: "The course title, slug, module list, and publication status are required." }, { status: 400 });
  if (!isValidCoverUrl(input.coverUrl)) return NextResponse.json({ error: "invalid_cover", detail: "The course cover must use a valid HTTP or HTTPS image URL." }, { status: 400 });
  if (JSON.stringify(input).length > 10_000_000) return NextResponse.json({ error: "course_too_large", detail: "This course is too large to save in one request." }, { status: 413 });
  const moduleSlugs = input.modules.map((courseModule) => courseModule.slug);
  if (new Set(moduleSlugs).size !== moduleSlugs.length) return NextResponse.json({ error: "duplicate_slug", detail: "Every module needs a unique URL slug." }, { status: 400 });
  for (const courseModule of input.modules) {
    if (!courseModule.title?.trim() || !courseModule.slug?.trim() || !Array.isArray(courseModule.lessons) || !isPublicationStatus(courseModule.status)) return NextResponse.json({ error: "invalid_module", detail: "Every module needs a title, slug, lesson list, and publication status." }, { status: 400 });
    const lessonSlugs = courseModule.lessons.map((lesson) => lesson.slug);
    if (new Set(lessonSlugs).size !== lessonSlugs.length) return NextResponse.json({ error: "duplicate_slug", detail: `Every lesson inside “${courseModule.title}” needs a unique URL slug.` }, { status: 400 });
    for (const lesson of courseModule.lessons) {
      if (!lesson.title?.trim() || !lesson.slug?.trim() || !Array.isArray(lesson.blocks) || !isPublicationStatus(lesson.status)) return NextResponse.json({ error: "invalid_lesson", detail: "Every lesson needs a title, slug, content list, and publication status." }, { status: 400 });
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

  const publicationIssue = findPublicationIssue(input);
  if (publicationIssue) {
    return NextResponse.json(
      { error: "content_not_publishable", detail: publicationIssue },
      { status: 400 },
    );
  }

  try {
    const deletionConflict = await findDeletionConflict(id, input);
    if (deletionConflict) {
      return NextResponse.json(
        { error: "content_has_history", detail: deletionConflict },
        { status: 409 },
      );
    }
    const ok = await saveCourse(input);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "save_failed", detail: "The course changes could not be saved. Content with student completions or practice attempts must be unpublished instead of deleted." }, { status: 500 });
  } catch (error) {
    reportServerError("admin.course.save_failed", error, {
      provider: "supabase",
      route: "/api/admin/courses/[id]",
      method: "PUT",
    });
    return NextResponse.json(
      { error: "save_failed", detail: "The course changes could not be saved." },
      { status: 500 },
    );
  }
}

function isValidCoverUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return true;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return true;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const deletionConflict = await findDeletionConflict(id, null);
    if (deletionConflict) {
      return NextResponse.json(
        { error: "content_has_history", detail: deletionConflict },
        { status: 409 },
      );
    }
    return (await deleteCourse(id))
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "delete_failed", detail: "The course could not be deleted because it may have student history. Unpublish it instead." }, { status: 500 });
  } catch (error) {
    reportServerError("admin.course.delete_failed", error, {
      provider: "supabase",
      route: "/api/admin/courses/[id]",
      method: "DELETE",
    });
    return NextResponse.json(
      { error: "delete_failed", detail: "The course could not be deleted." },
      { status: 500 },
    );
  }
}

type ExistingModule = { id: string };
type ExistingLesson = { id: string; module_id: string };
type ExistingBlock = { id: string; lesson_id: string };

async function findDeletionConflict(courseId: string, input: CourseInput | null): Promise<string | null> {
  const modules = await loadExistingModules(courseId);
  const moduleIds = modules.map((courseModule) => courseModule.id);
  const lessons = await loadExistingLessons(moduleIds);
  const lessonIds = lessons.map((lesson) => lesson.id);
  const blocks = await loadExistingBlocks(lessonIds);

  const retainedModuleIds = new Set(input?.modules.map((courseModule) => courseModule.id) ?? []);
  const retainedLessonIds = new Set(
    input?.modules.flatMap((courseModule) => courseModule.lessons.map((lesson) => lesson.id)) ?? [],
  );
  const retainedBlockIds = new Set(
    input?.modules.flatMap((courseModule) => courseModule.lessons.flatMap(
      (lesson) => lesson.blocks.map((block) => block.id),
    )) ?? [],
  );
  const removedModuleIds = new Set(modules.filter((courseModule) => !retainedModuleIds.has(courseModule.id)).map((courseModule) => courseModule.id));
  const removedLessonIds = lessons
    .filter((lesson) => removedModuleIds.has(lesson.module_id) || !retainedLessonIds.has(lesson.id))
    .map((lesson) => lesson.id);
  const removedLessonIdSet = new Set(removedLessonIds);
  const removedBlockIds = blocks
    .filter((block) => removedLessonIdSet.has(block.lesson_id) || !retainedBlockIds.has(block.id))
    .map((block) => block.id);

  if (await hasRows("course_lesson_completions", "lesson_id", removedLessonIds)) {
    return "A lesson you removed has student completion history. Set the lesson or its parent module to Draft instead.";
  }
  if (
    await hasRows("course_practice_attempts", "lesson_id", removedLessonIds)
    || await hasRows("course_practice_attempts", "block_id", removedBlockIds)
  ) {
    return "Content you removed has student practice attempts. Set the lesson, module, or course to Draft instead.";
  }
  return null;
}

const HIERARCHY_PAGE_SIZE = 1000;

async function loadExistingModules(courseId: string): Promise<ExistingModule[]> {
  const rows: ExistingModule[] = [];
  for (let from = 0; ; from += HIERARCHY_PAGE_SIZE) {
    const result = await supabaseAdmin()
      .from("course_modules")
      .select("id")
      .eq("course_id", courseId)
      .order("id")
      .range(from, from + HIERARCHY_PAGE_SIZE - 1)
      .returns<ExistingModule[]>();
    if (result.error) throw new Error(`Could not verify course modules: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < HIERARCHY_PAGE_SIZE) return rows;
  }
}

async function loadExistingLessons(moduleIds: string[]): Promise<ExistingLesson[]> {
  const rows: ExistingLesson[] = [];
  for (const moduleIdBatch of chunks(moduleIds, 100)) {
    for (let from = 0; ; from += HIERARCHY_PAGE_SIZE) {
      const result = await supabaseAdmin()
        .from("course_lessons")
        .select("id,module_id")
        .in("module_id", moduleIdBatch)
        .order("id")
        .range(from, from + HIERARCHY_PAGE_SIZE - 1)
        .returns<ExistingLesson[]>();
      if (result.error) throw new Error(`Could not verify course lessons: ${result.error.message}`);
      const page = result.data ?? [];
      rows.push(...page);
      if (page.length < HIERARCHY_PAGE_SIZE) break;
    }
  }
  return rows;
}

async function loadExistingBlocks(lessonIds: string[]): Promise<ExistingBlock[]> {
  const rows: ExistingBlock[] = [];
  for (const lessonIdBatch of chunks(lessonIds, 100)) {
    for (let from = 0; ; from += HIERARCHY_PAGE_SIZE) {
      const result = await supabaseAdmin()
        .from("course_lesson_blocks")
        .select("id,lesson_id")
        .in("lesson_id", lessonIdBatch)
        .order("id")
        .range(from, from + HIERARCHY_PAGE_SIZE - 1)
        .returns<ExistingBlock[]>();
      if (result.error) throw new Error(`Could not verify lesson content: ${result.error.message}`);
      const page = result.data ?? [];
      rows.push(...page);
      if (page.length < HIERARCHY_PAGE_SIZE) break;
    }
  }
  return rows;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function hasRows(
  table: "course_lesson_completions" | "course_practice_attempts",
  column: "lesson_id" | "block_id",
  ids: string[],
): Promise<boolean> {
  const db = supabaseAdmin();
  for (let index = 0; index < ids.length; index += 100) {
    const result = await db
      .from(table)
      .select(column)
      .in(column, ids.slice(index, index + 100))
      .limit(1);
    if (result.error) throw new Error(`Could not verify student history: ${result.error.message}`);
    if ((result.data?.length ?? 0) > 0) return true;
  }
  return false;
}

function findPublicationIssue(input: CourseInput): string | null {
  if (input.status !== "published") return null;
  const publishedModules = input.modules.filter((courseModule) => courseModule.status === "published");
  if (publishedModules.length === 0) {
    return "A published course needs at least one published module.";
  }
  for (const courseModule of publishedModules) {
    if (!courseModule.lessons.some((lesson) => lesson.status === "published")) {
      return `Published module “${courseModule.title}” needs at least one published lesson.`;
    }
  }
  const course: Course = {
    ...input,
    completedLessons: 0,
    totalLessons: input.modules.reduce((total, courseModule) => total + courseModule.lessons.length, 0),
    progress: 0,
  };
  const publishedLessonIds = new Set(
    publishedModules.flatMap((courseModule) => courseModule.lessons)
      .filter((lesson) => lesson.status === "published")
      .map((lesson) => lesson.id),
  );
  const blocking = auditCourse(course).issues.find(
    (issue) => issue.severity === "missing" && publishedLessonIds.has(issue.lessonId),
  );
  if (blocking) return `${blocking.title}. ${blocking.detail}`;

  for (const courseModule of publishedModules) {
    for (const lesson of courseModule.lessons) {
      if (lesson.status !== "published") continue;
      const emptyText = lesson.blocks.find(
        (block) => block.kind === "text" && !block.content.body?.trim(),
      );
      if (emptyText) return `“${lesson.title}” cannot be published because a text block is empty.`;
    }
  }
  return null;
}
