import { FREE_COURSE_SLUGS } from "@/lib/auth/plans";
import type { Course, CourseLesson } from "./types";

// A lesson URL is /courses/<course>/<lesson> — there is no module segment — so
// the reader resolves a lesson slug across the whole course and takes the first
// match. The lessons table only guarantees unique(module_id, slug), so two
// modules can each hold a "lesson-1"; the outline then renders both rows with
// the same href and the second is dead, linking to the page you are already on.
// Course-wide uniqueness is the invariant the URL space actually requires.
export function findDuplicateLessonSlug(
  modules: { lessons?: { slug?: string | null }[] }[],
): string | null {
  const seen = new Set<string>();
  for (const courseModule of modules) {
    for (const lesson of Array.isArray(courseModule.lessons) ? courseModule.lessons : []) {
      const slug = lesson.slug?.trim();
      if (!slug) continue;
      if (seen.has(slug)) return slug;
      seen.add(slug);
    }
  }
  return null;
}

export function findNextIncompleteLesson(course: Course): CourseLesson | undefined {
  return course.modules.flatMap((module) => module.lessons).find((lesson) => !lesson.completed);
}

export function getCourseContinueHref(course: Course, locked = false): string {
  const base = `/ultimate/courses/${course.slug}`;
  if (locked) return base;

  const nextLesson = findNextIncompleteLesson(course);
  return nextLesson ? `${base}/${nextLesson.slug}` : base;
}

export function sumLessonProgress(courses: Course[]): { completed: number; total: number } {
  return courses.reduce(
    (totals, course) => ({
      completed: totals.completed + course.completedLessons,
      total: totals.total + course.totalLessons,
    }),
    { completed: 0, total: 0 },
  );
}

const FOUNDATIONS_SLUG = "blueprint-foundations";
const SUBTOPIC_COURSE_SLUGS = ["math-subtopic-course", "reading-writing-subtopic-course"];

// The order the home page recommends a course in: Blueprint Foundations, then
// the Blueprint courses that follow it (the Accelerator, and anything published
// after it -- keyed off the slugs we do know, so a new course needs no change
// here), then the subtopic courses, and last the free ones.
function recommendationRank(slug: string): number {
  if (slug === FOUNDATIONS_SLUG) return 0;
  if (SUBTOPIC_COURSE_SLUGS.includes(slug)) return 2;
  if (FREE_COURSE_SLUGS.includes(slug)) return 3;
  return 1;
}

// The course the home page offers to continue. The first one still unfinished
// in that order wins, so Foundations is the default and the Accelerator takes
// over once Foundations is complete. Students with every course included are
// never sent to a free course; it is not what they are paying to work through.
export function findActiveCourse(
  courses: Course[],
  options: { hideFreeCourses?: boolean } = {},
): Course | null {
  const candidates = options.hideFreeCourses
    ? courses.filter((course) => !FREE_COURSE_SLUGS.includes(course.slug))
    : courses;
  const ranked = candidates
    .map((course, index) => ({ course, index }))
    .sort(
      (a, b) =>
        recommendationRank(a.course.slug) - recommendationRank(b.course.slug) ||
        a.index - b.index,
    )
    .map((entry) => entry.course);
  return ranked.find((course) => course.progress < 100) ?? ranked[0] ?? null;
}

export function getContinueCourseHref(course: Course | null): string {
  if (!course) return "/ultimate/courses";

  const nextLesson = findNextIncompleteLesson(course);
  const base = `/ultimate/courses/${course.slug}`;
  return nextLesson ? `${base}/${nextLesson.slug}` : base;
}

export function getContinueCourseLabel(hasNextLesson: boolean, hasActiveCourse: boolean): string {
  if (hasNextLesson) return "Continue lesson";
  if (hasActiveCourse) return "Open course";
  return "Browse courses";
}

export function getHomeCourseCardLabel(locked: boolean, progress: number): string {
  if (locked) return "Unlock";
  if (progress > 0) return "Continue";
  return "Start";
}

// The courses tab groups the curriculum into named sections. A course that no
// section lists -- anything published since these groups were written -- used
// to be dropped from the page entirely, so a newly published course never
// appeared. Leftovers now join the section marked catchAll, which is where a
// new Blueprint course belongs without having to name its slug here.
export type CourseSectionDefinition = {
  title: string;
  slugs: readonly string[];
  catchAll?: boolean;
};
export type CourseSection = { title: string; courses: Course[] };

export function groupCoursesIntoSections(
  courses: Course[],
  definitions: readonly CourseSectionDefinition[],
  restTitle = "More courses",
): CourseSection[] {
  const listed = new Set(definitions.flatMap((section) => [...section.slugs]));
  const rest = courses.filter((course) => !listed.has(course.slug));
  const catchAll = definitions.find((section) => section.catchAll);
  const grouped = definitions.map((section) => ({
    title: section.title,
    courses: [
      ...courses.filter((course) => section.slugs.includes(course.slug)),
      ...(section === catchAll ? rest : []),
    ],
  }));
  return [
    ...grouped,
    ...(catchAll ? [] : [{ title: restTitle, courses: rest }]),
  ].filter((section) => section.courses.length > 0);
}
