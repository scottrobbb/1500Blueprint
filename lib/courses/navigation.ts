import type { Course, CourseLesson } from "./types";

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
