import { canAccessCourse, getStudentAccess } from "@/lib/auth/entitlements";
import { supabaseAdmin } from "@/utils/supabase/admin";
import type { SavedCoursePracticeAttempt } from "./practice";
import type { Course, CourseInput, CourseLesson, CourseModule, CourseStatus, LessonBlock } from "./types";
import { canonicalizeCourseAssetReferences, signCourseAssetReferences } from "./assets.server";

type CourseRow = {
  id: string; slug: string; title: string; description: string | null; eyebrow: string | null;
  cover_url: string | null; cover_zoom: number; position: number; estimated_minutes: number; status: string;
};
type ModuleRow = { id: string; course_id: string; slug: string; title: string; description: string | null; position: number; status: string };
type LessonRow = { id: string; module_id: string; slug: string; title: string; summary: string | null; position: number; estimated_minutes: number; status: string };
type BlockRow = { id: string; lesson_id: string; position: number; kind: string; content: LessonBlock["content"] };

const COURSE_COLUMNS = "id,slug,title,description,eyebrow,cover_url,cover_zoom,position,estimated_minutes,status";

function status(value: string): CourseStatus { return value === "published" ? "published" : "draft"; }

async function hydrateCourses(
  rows: CourseRow[],
  email: string,
  publishedOnly: boolean,
  strict = false,
): Promise<Course[]> {
  if (rows.length === 0) return [];
  const db = supabaseAdmin();
  const courseIds = rows.map((row) => row.id);
  let modulesQuery = db.from("course_modules").select("id,course_id,slug,title,description,position,status").in("course_id", courseIds).order("position");
  if (publishedOnly) modulesQuery = modulesQuery.eq("status", "published");
  const modulesResult = await modulesQuery.returns<ModuleRow[]>();
  if (strict && modulesResult.error) throw modulesResult.error;
  const moduleRows = modulesResult.data ?? [];
  const moduleIds = moduleRows.map((row) => row.id);
  let lessonRows: LessonRow[] = [];
  if (moduleIds.length > 0) {
    let lessonsQuery = db.from("course_lessons").select("id,module_id,slug,title,summary,position,estimated_minutes,status").in("module_id", moduleIds).order("position");
    if (publishedOnly) lessonsQuery = lessonsQuery.eq("status", "published");
    const lessonsResult = await lessonsQuery.returns<LessonRow[]>();
    if (strict && lessonsResult.error) throw lessonsResult.error;
    lessonRows = lessonsResult.data ?? [];
  }
  const lessonIds = lessonRows.map((row) => row.id);
  const [blocksResult, completionsResult] = await Promise.all([
    lessonIds.length > 0
      ? db.from("course_lesson_blocks").select("id,lesson_id,position,kind,content").in("lesson_id", lessonIds).order("position").returns<BlockRow[]>()
      : Promise.resolve({ data: [] as BlockRow[], error: null }),
    lessonIds.length > 0
      ? db.from("course_lesson_completions").select("lesson_id").eq("email", email).in("lesson_id", lessonIds).returns<{ lesson_id: string }[]>()
      : Promise.resolve({ data: [] as { lesson_id: string }[], error: null }),
  ]);
  if (strict && blocksResult.error) throw blocksResult.error;
  if (strict && completionsResult.error) throw completionsResult.error;
  const completed = new Set((completionsResult.data ?? []).map((row) => row.lesson_id));
  const rawBlocks = blocksResult.data ?? [];
  const [signedRows, blocks] = await Promise.all([
    signCourseAssetReferences(rows, strict),
    signCourseAssetReferences(rawBlocks, strict),
  ]);

  return signedRows.map((courseRow) => {
    const modules: CourseModule[] = moduleRows.filter((row) => row.course_id === courseRow.id).map((moduleRow) => ({
      id: moduleRow.id,
      slug: moduleRow.slug,
      title: moduleRow.title,
      description: moduleRow.description,
      position: moduleRow.position,
      status: status(moduleRow.status),
      lessons: lessonRows.filter((row) => row.module_id === moduleRow.id).map((lessonRow): CourseLesson => ({
        id: lessonRow.id,
        slug: lessonRow.slug,
        title: lessonRow.title,
        summary: lessonRow.summary,
        position: lessonRow.position,
        estimatedMinutes: lessonRow.estimated_minutes,
        status: status(lessonRow.status),
        completed: completed.has(lessonRow.id),
        blocks: blocks.filter((row) => row.lesson_id === lessonRow.id).map((row) => ({
          id: row.id, position: row.position, kind: row.kind as LessonBlock["kind"], content: row.content,
        })),
      })),
    }));
    const lessons = modules.flatMap((module) => module.lessons);
    const completedLessons = lessons.filter((lesson) => lesson.completed).length;
    return {
      id: courseRow.id,
      slug: courseRow.slug,
      title: courseRow.title,
      description: courseRow.description,
      eyebrow: courseRow.eyebrow,
      coverUrl: courseRow.cover_url,
      coverZoom: courseRow.cover_zoom,
      position: courseRow.position,
      estimatedMinutes: courseRow.estimated_minutes,
      status: status(courseRow.status),
      modules,
      completedLessons,
      totalLessons: lessons.length,
      progress: lessons.length > 0 ? Math.round((completedLessons / lessons.length) * 100) : 0,
    };
  });
}

export async function listCoursesForStudent(email: string): Promise<Course[]> {
  const { data } = await supabaseAdmin().from("courses").select(COURSE_COLUMNS).eq("status", "published").order("position").returns<CourseRow[]>();
  return hydrateCourses(data ?? [], email, true);
}

export async function listCoursesForStudentStrict(email: string): Promise<Course[]> {
  const result = await supabaseAdmin()
    .from("courses")
    .select(COURSE_COLUMNS)
    .eq("status", "published")
    .order("position")
    .returns<CourseRow[]>();
  if (result.error) throw result.error;
  return hydrateCourses(result.data ?? [], email, true, true);
}

export async function getCourseForStudent(slug: string, email: string): Promise<Course | null> {
  const { data } = await supabaseAdmin().from("courses").select(COURSE_COLUMNS).eq("slug", slug).eq("status", "published").maybeSingle<CourseRow>();
  if (!data) return null;
  return (await hydrateCourses([data], email, true))[0] ?? null;
}

export async function listCoursesForAdmin(email: string): Promise<Course[]> {
  const { data } = await supabaseAdmin().from("courses").select(COURSE_COLUMNS).order("position").returns<CourseRow[]>();
  return hydrateCourses(data ?? [], email, false);
}

export async function getCourseForAdmin(id: string, email: string): Promise<Course | null> {
  const { data } = await supabaseAdmin().from("courses").select(COURSE_COLUMNS).eq("id", id).maybeSingle<CourseRow>();
  if (!data) return null;
  return (await hydrateCourses([data], email, false))[0] ?? null;
}

export async function createCourse(position: number): Promise<string | null> {
  const id = crypto.randomUUID();
  const { error } = await supabaseAdmin().from("courses").insert({ id, slug: `course-${id.slice(0, 8)}`, title: "Untitled course", position, status: "draft" });
  return error ? null : id;
}

type IdPage = { data: { id: string }[] | null; error: { message: string } | null };

async function loadAllIds(
  loadPage: (from: number, to: number) => PromiseLike<IdPage>,
): Promise<string[] | null> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await loadPage(from, from + pageSize - 1);
    if (result.error) return null;
    const page = result.data ?? [];
    ids.push(...page.map((row) => row.id));
    if (page.length < pageSize) return ids;
  }
}

export async function saveCourse(input: CourseInput): Promise<boolean> {
  const db = supabaseAdmin();
  input = canonicalizeCourseAssetReferences(input);
  const courseResult = await db.from("courses").upsert({
    id: input.id, slug: input.slug.trim(), title: input.title.trim() || "Untitled course",
    description: input.description?.trim() || null, eyebrow: input.eyebrow?.trim() || null,
    cover_url: input.coverUrl?.trim() || null, cover_zoom: Math.min(3, Math.max(1, input.coverZoom || 1)), position: input.position,
    estimated_minutes: input.estimatedMinutes, status: input.status, updated_at: new Date().toISOString(),
  });
  if (courseResult.error) return false;
  const moduleIds = input.modules.map((module) => module.id);
  const existingModuleIds = await loadAllIds((from, to) => db
    .from("course_modules")
    .select("id")
    .eq("course_id", input.id)
    .order("id")
    .range(from, to)
    .returns<{ id: string }[]>());
  if (!existingModuleIds) return false;
  const removedModuleIds = existingModuleIds.filter((id) => !moduleIds.includes(id));
  if (removedModuleIds.length > 0 && (await db.from("course_modules").delete().in("id", removedModuleIds)).error) return false;
  for (const [moduleIndex, module] of input.modules.entries()) {
    const moduleResult = await db.from("course_modules").upsert({
      id: module.id, course_id: input.id, slug: module.slug, title: module.title,
      description: module.description, position: moduleIndex + 1, status: module.status,
    });
    if (moduleResult.error) return false;
    const lessonIds = module.lessons.map((lesson) => lesson.id);
    const existingLessonIds = await loadAllIds((from, to) => db
      .from("course_lessons")
      .select("id")
      .eq("module_id", module.id)
      .order("id")
      .range(from, to)
      .returns<{ id: string }[]>());
    if (!existingLessonIds) return false;
    const removedLessonIds = existingLessonIds.filter((id) => !lessonIds.includes(id));
    if (removedLessonIds.length > 0 && (await db.from("course_lessons").delete().in("id", removedLessonIds)).error) return false;
    for (const [lessonIndex, lesson] of module.lessons.entries()) {
      const lessonResult = await db.from("course_lessons").upsert({
        id: lesson.id, module_id: module.id, slug: lesson.slug, title: lesson.title,
        summary: lesson.summary, position: lessonIndex + 1, estimated_minutes: lesson.estimatedMinutes,
        status: lesson.status,
      });
      if (lessonResult.error) return false;
      // Preserve stable block rows. Deleting and reinserting every block erased
      // course_practice_attempts through the block FK's ON DELETE CASCADE.
      const existingBlockIds = await loadAllIds((from, to) => db
        .from("course_lesson_blocks")
        .select("id")
        .eq("lesson_id", lesson.id)
        .order("id")
        .range(from, to)
        .returns<{ id: string }[]>());
      if (!existingBlockIds) return false;
      if (lesson.blocks.length > 0) {
        const blockResult = await db.from("course_lesson_blocks").upsert(lesson.blocks.map((block, blockIndex) => ({
          id: block.id, lesson_id: lesson.id, position: blockIndex + 1, kind: block.kind, content: block.content,
        })));
        if (blockResult.error) return false;
      }
      const blockIds = new Set(lesson.blocks.map((block) => block.id));
      const removedBlockIds = existingBlockIds.filter((id) => !blockIds.has(id));
      if (removedBlockIds.length > 0) {
        const removedBlocks = await db.from("course_lesson_blocks").delete().in("id", removedBlockIds);
        if (removedBlocks.error) return false;
      }
    }
  }
  return true;
}

export async function deleteCourse(id: string): Promise<boolean> {
  return !(await supabaseAdmin().from("courses").delete().eq("id", id)).error;
}

export async function setLessonComplete(email: string, lessonId: string, complete: boolean): Promise<boolean> {
  const db = supabaseAdmin();
  const result = complete
    ? await db.from("course_lesson_completions").upsert({ email, lesson_id: lessonId, completed_at: new Date().toISOString() })
    : await db.from("course_lesson_completions").delete().eq("email", email).eq("lesson_id", lessonId);
  return !result.error;
}

export async function canAccessPublishedCourseLesson(email: string, lessonId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const lesson = await db
    .from("course_lessons")
    .select("module_id,status")
    .eq("id", lessonId)
    .maybeSingle<{ module_id: string; status: string }>();
  if (lesson.error) throw new Error(`Could not load course lesson [${lesson.error.code}]: ${lesson.error.message}`);
  if (!lesson.data || lesson.data.status !== "published") return false;

  const courseModule = await db
    .from("course_modules")
    .select("course_id,status")
    .eq("id", lesson.data.module_id)
    .maybeSingle<{ course_id: string; status: string }>();
  if (courseModule.error) throw new Error(`Could not load course module [${courseModule.error.code}]: ${courseModule.error.message}`);
  if (!courseModule.data || courseModule.data.status !== "published") return false;

  const [course, access] = await Promise.all([
    db
      .from("courses")
      .select("slug,status")
      .eq("id", courseModule.data.course_id)
      .maybeSingle<{ slug: string; status: string }>(),
    getStudentAccess(email),
  ]);
  if (course.error) throw new Error(`Could not load course [${course.error.code}]: ${course.error.message}`);
  return Boolean(
    access.active
    && course.data
    && course.data.status === "published"
    && canAccessCourse(access, course.data.slug),
  );
}

type CoursePracticeAttemptRow = {
  id: string;
  score: number;
  correct_count: number;
  question_count: number;
  passed: boolean;
  completed_at: string;
};

export async function getLatestCoursePracticeAttempts(
  email: string,
  blockIds: string[],
): Promise<Map<string, SavedCoursePracticeAttempt>> {
  const uniqueBlockIds = [...new Set(blockIds)];
  const rows = await Promise.all(uniqueBlockIds.map(async (blockId) => {
    const db = supabaseAdmin();
    const [latest, count, best] = await Promise.all([
      db.from("course_practice_attempts")
        .select("id,score,correct_count,question_count,passed,completed_at")
        .eq("email", email)
        .eq("block_id", blockId)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle<CoursePracticeAttemptRow>(),
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
    if (latest.error || count.error || best.error) throw latest.error ?? count.error ?? best.error;
    return latest.data ? [blockId, latest.data, count.count ?? 1, best.data?.score ?? latest.data.score] as const : null;
  }));

  return new Map(rows.flatMap((entry) => entry ? [[entry[0], {
    id: entry[1].id,
    score: entry[1].score,
    correctCount: entry[1].correct_count,
    questionCount: entry[1].question_count,
    passed: entry[1].passed,
    completedAt: entry[1].completed_at,
    attemptCount: entry[2],
    bestScore: entry[3],
  }] as const] : []));
}
