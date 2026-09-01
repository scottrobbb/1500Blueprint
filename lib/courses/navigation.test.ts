import assert from "node:assert/strict";
import test from "node:test";
import {
  findActiveCourse,
  findNextIncompleteLesson,
  getContinueCourseHref,
  getContinueCourseLabel,
  getCourseContinueHref,
  getHomeCourseCardLabel,
  sumLessonProgress,
} from "./navigation";
import type { Course } from "./types";

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    slug: "blueprint-foundations",
    title: "Blueprint Foundations",
    description: null,
    eyebrow: null,
    coverUrl: null,
    coverZoom: 1,
    position: 0,
    estimatedMinutes: 60,
    status: "published",
    completedLessons: 0,
    totalLessons: 2,
    progress: 0,
    modules: [
      {
        id: "module-1",
        slug: "module-1",
        title: "Module 1",
        description: null,
        position: 0,
        status: "published",
        lessons: [
          {
            id: "lesson-1",
            slug: "lesson-1",
            title: "Lesson 1",
            summary: null,
            position: 0,
            estimatedMinutes: 10,
            status: "published",
            completed: false,
            blocks: [],
          },
          {
            id: "lesson-2",
            slug: "lesson-2",
            title: "Lesson 2",
            summary: null,
            position: 1,
            estimatedMinutes: 10,
            status: "published",
            completed: true,
            blocks: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("findNextIncompleteLesson returns the first incomplete lesson", () => {
  assert.equal(findNextIncompleteLesson(course())?.slug, "lesson-1");
  assert.equal(findNextIncompleteLesson(course({ modules: [] })), undefined);
});

test("getCourseContinueHref respects lock state and next lesson", () => {
  assert.equal(getCourseContinueHref(course(), true), "/ultimate/courses/blueprint-foundations");
  assert.equal(getCourseContinueHref(course()), "/ultimate/courses/blueprint-foundations/lesson-1");
});

test("sumLessonProgress totals completed and total lessons", () => {
  assert.deepEqual(sumLessonProgress([course({ completedLessons: 1, totalLessons: 2 }), course({ completedLessons: 2, totalLessons: 4 })]), {
    completed: 3,
    total: 6,
  });
});

test("findActiveCourse prefers an in-progress course", () => {
  const complete = course({ progress: 100 });
  const active = course({ id: "course-2", progress: 40 });
  assert.equal(findActiveCourse([complete, active])?.id, "course-2");
  assert.equal(findActiveCourse([complete])?.id, "course-1");
  assert.equal(findActiveCourse([]), null);
});

test("getContinueCourseHref falls back to the courses index", () => {
  assert.equal(getContinueCourseHref(null), "/ultimate/courses");
  assert.equal(getContinueCourseHref(course()), "/ultimate/courses/blueprint-foundations/lesson-1");
});

test("label helpers avoid nested ternaries at call sites", () => {
  assert.equal(getContinueCourseLabel(true, true), "Continue lesson");
  assert.equal(getContinueCourseLabel(false, true), "Open course");
  assert.equal(getContinueCourseLabel(false, false), "Browse courses");
  assert.equal(getHomeCourseCardLabel(true, 50), "Unlock");
  assert.equal(getHomeCourseCardLabel(false, 50), "Continue");
  assert.equal(getHomeCourseCardLabel(false, 0), "Start");
});
