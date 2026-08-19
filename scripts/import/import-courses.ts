/**
 * Import a normalized course manifest. Audit is the default; add --write after
 * reviewing counts. IDs are deterministic, so reruns update instead of duplicate.
 *
 * npx tsx --env-file=.env.local scripts/import/import-courses.ts manifest.json
 * npx tsx --env-file=.env.local scripts/import/import-courses.ts manifest.json --write
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import type { CourseInput, CourseStatus, LessonBlockKind } from "../../lib/courses/types";
import { saveCourse } from "../../lib/courses/queries";

type ManifestBlock = { kind: LessonBlockKind; content: Record<string, string> };
type ManifestLesson = { slug: string; title: string; summary?: string; estimatedMinutes?: number; status?: CourseStatus; blocks?: ManifestBlock[] };
type ManifestModule = { slug: string; title: string; description?: string; status?: CourseStatus; lessons?: ManifestLesson[] };
type ManifestCourse = { slug: string; title: string; description?: string; eyebrow?: string; coverUrl?: string | null; estimatedMinutes?: number; status?: CourseStatus; modules?: ManifestModule[] };
type Manifest = { courses: ManifestCourse[] };

const args = process.argv.slice(2);
const manifestArgument = args.find((arg) => !arg.startsWith("--"));
const write = args.includes("--write");
if (!manifestArgument) throw new Error("Pass a course manifest JSON path.");
const manifestPath: string = manifestArgument;

function id(...parts: string[]): string { return `course-${crypto.createHash("sha256").update(parts.join("/")).digest("hex").slice(0, 32)}`; }
function normalized(input: ManifestCourse, courseIndex: number): CourseInput {
  return {
    id: id(input.slug), slug: input.slug, title: input.title, description: input.description ?? null,
    eyebrow: input.eyebrow ?? null, coverUrl: input.coverUrl ?? null, position: courseIndex + 1,
    estimatedMinutes: input.estimatedMinutes ?? 0, status: input.status ?? "draft",
    modules: (input.modules ?? []).map((module, moduleIndex) => ({
      id: id(input.slug, module.slug), slug: module.slug, title: module.title,
      description: module.description ?? null, position: moduleIndex + 1, status: module.status ?? "draft",
      lessons: (module.lessons ?? []).map((lesson, lessonIndex) => ({
        id: id(input.slug, module.slug, lesson.slug), slug: lesson.slug, title: lesson.title,
        summary: lesson.summary ?? null, position: lessonIndex + 1, estimatedMinutes: lesson.estimatedMinutes ?? 0,
        status: lesson.status ?? "draft", completed: false,
        blocks: (lesson.blocks ?? []).map((block, blockIndex) => ({
          id: id(input.slug, module.slug, lesson.slug, String(blockIndex + 1)), position: blockIndex + 1,
          kind: block.kind, content: block.content,
        })),
      })),
    })),
  };
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Manifest;
  if (!Array.isArray(manifest.courses)) throw new Error("Manifest must contain a courses array.");
  const courses = manifest.courses.map(normalized);
  const modules = courses.flatMap((course) => course.modules);
  const lessons = modules.flatMap((module) => module.lessons);
  console.log(`Courses: ${courses.length}\nModules: ${modules.length}\nLessons: ${lessons.length}\nBlocks: ${lessons.flatMap((lesson) => lesson.blocks).length}`);
  if (!write) { console.log("Audit only. Add --write to import."); return; }
  for (const course of courses) {
    if (!(await saveCourse(course))) throw new Error(`Failed to import ${course.slug}`);
    console.log(`Imported ${course.slug}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
