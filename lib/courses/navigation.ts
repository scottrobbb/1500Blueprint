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

export function findActiveCourse(courses: Course[]): Course | null {
  return courses.find((course) => course.progress < 100) ?? courses[0] ?? null;
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
