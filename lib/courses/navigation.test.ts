import assert from "node:assert/strict";
import test from "node:test";
import {
  findActiveCourse,
  findDuplicateLessonSlug,
  findNextIncompleteLesson,
  getContinueCourseHref,
  getContinueCourseLabel,
  getCourseContinueHref,
  getHomeCourseCardLabel,
  groupCoursesIntoSections,
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

test("findDuplicateLessonSlug accepts a course whose lesson slugs are all distinct", () => {
  assert.equal(findDuplicateLessonSlug(course().modules), null);
  assert.equal(findDuplicateLessonSlug([]), null);
});

test("findDuplicateLessonSlug catches a slug reused across two modules", () => {
  // What broke Reading 101: the editor numbered new lessons within their own
  // module, so the first lesson of every module was handed "lesson-1". Both
  // outline rows then pointed at /courses/reading-101/lesson-1.
  const modules = [
    { lessons: [{ slug: "lesson-1" }] },
    { lessons: [{ slug: "lesson-1" }] },
  ];
  assert.equal(findDuplicateLessonSlug(modules), "lesson-1");
});

test("findDuplicateLessonSlug ignores blank slugs and trims before comparing", () => {
  assert.equal(findDuplicateLessonSlug([{ lessons: [{ slug: "" }, { slug: null }] }]), null);
  assert.equal(findDuplicateLessonSlug([{ lessons: [{ slug: "intro" }, { slug: " intro " }] }]), "intro");
});

test("findDuplicateLessonSlug tolerates a module with no lessons", () => {
  assert.equal(findDuplicateLessonSlug([{}, { lessons: [{ slug: "intro" }] }]), null);
});

const SECTIONS = [
  { title: "Blueprint courses", slugs: ["blueprint-foundations"], catchAll: true },
  { title: "Free courses", slugs: ["desmos-101"] },
] as const;

// Regression: the courses tab only rendered slugs the sections named, so a
// course published after those groups were written never appeared at all.
test("a published course no section names joins the Blueprint section", () => {
  const sections = groupCoursesIntoSections(
    [
      course({ id: "1", slug: "blueprint-foundations" }),
      course({ id: "2", slug: "blueprint-accelerator" }),
      course({ id: "3", slug: "desmos-101" }),
    ],
    SECTIONS,
  );
  assert.deepEqual(
    sections.map((section) => [section.title, section.courses.map((entry) => entry.slug)]),
    [
      ["Blueprint courses", ["blueprint-foundations", "blueprint-accelerator"]],
      ["Free courses", ["desmos-101"]],
    ],
  );
});

test("with no catch-all section, leftovers get one of their own", () => {
  const sections = groupCoursesIntoSections(
    [course({ id: "1", slug: "desmos-101" }), course({ id: "2", slug: "new-course" })],
    [{ title: "Free courses", slugs: ["desmos-101"] }],
  );
  assert.deepEqual(
    sections.map((section) => [section.title, section.courses.map((entry) => entry.slug)]),
    [
      ["Free courses", ["desmos-101"]],
      ["More courses", ["new-course"]],
    ],
  );
});

test("sections hold their listed order, and empty ones are dropped", () => {
  const sections = groupCoursesIntoSections(
    [course({ id: "1", slug: "desmos-101" })],
    SECTIONS,
  );
  assert.deepEqual(sections.map((section) => section.title), ["Free courses"]);
});

test("every course listed by a section leaves no leftovers", () => {
  const sections = groupCoursesIntoSections(
    [course({ id: "1", slug: "blueprint-foundations" })],
    SECTIONS,
  );
  assert.deepEqual(
    sections.map((section) => [section.title, section.courses.map((entry) => entry.slug)]),
    [["Blueprint courses", ["blueprint-foundations"]]],
  );
});
