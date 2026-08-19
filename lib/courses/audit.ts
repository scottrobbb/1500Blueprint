import { isCoursePracticeQuestionComplete } from "./practice";
import type { Course, LessonBlock } from "./types";

export type CourseAuditIssue = {
  id: string;
  moduleId: string;
  lessonId: string;
  blockId?: string;
  severity: "missing" | "warning";
  category: "asset" | "practice" | "publishing" | "accessibility";
  title: string;
  detail: string;
};

export type CourseAudit = {
  issues: CourseAuditIssue[];
  missingAssets: number;
  practiceCount: number;
  questionCount: number;
  publishedLessons: number;
  readiness: number;
};

function validUrl(url?: string): boolean {
  if (!url) return false;
  if (url.startsWith("/")) return true;
  try { new URL(url); return true; } catch { return false; }
}

function issueForBlock(block: LessonBlock, moduleId: string, lessonId: string): Omit<CourseAuditIssue, "id">[] {
  const issues: Omit<CourseAuditIssue, "id">[] = [];
  const location = { moduleId, lessonId, blockId: block.id };
  if (block.content.status === "unavailable") {
    issues.push({ ...location, severity: "missing", category: block.content.eyebrow?.toLowerCase().includes("practice") || block.content.eyebrow?.toLowerCase().includes("quiz") ? "practice" : "asset", title: block.content.title ?? "Missing lesson asset", detail: block.content.body ?? "Upload or link the original source." });
    return issues;
  }
  if (block.kind === "video" && !validUrl(block.content.url)) issues.push({ ...location, severity: "missing", category: "asset", title: block.content.title || "Video is missing", detail: "Add a video URL or upload the video file." });
  if (block.kind === "file" && !validUrl(block.content.url)) issues.push({ ...location, severity: "missing", category: "asset", title: block.content.title || "Resource is missing", detail: "Upload the PDF, document, or downloadable resource." });
  if (block.kind === "image") {
    if (!validUrl(block.content.url)) issues.push({ ...location, severity: "missing", category: "asset", title: block.content.title || "Image is missing", detail: "Upload or link the lesson image." });
    else if (!block.content.alt?.trim()) issues.push({ ...location, severity: "warning", category: "accessibility", title: block.content.title || "Image needs alt text", detail: "Describe the image for screen-reader users." });
  }
  if (block.kind === "practice") {
    const practice = block.content.practice;
    if (!practice || practice.questions.length === 0) issues.push({ ...location, severity: "missing", category: "practice", title: practice?.title || block.content.title || "Practice has no questions", detail: "Add at least one complete question before publishing." });
    else {
      const incomplete = practice.questions.filter((question) => !isCoursePracticeQuestionComplete(question)).length;
      if (incomplete > 0) issues.push({ ...location, severity: "missing", category: "practice", title: `${practice.title}: ${incomplete} incomplete question${incomplete === 1 ? "" : "s"}`, detail: "Every question needs a prompt, correct answer, and explanation. MCQs need at least two choices." });
    }
  }
  return issues;
}

export function auditCourse(course: Course): CourseAudit {
  const issues: CourseAuditIssue[] = [];
  let practiceCount = 0;
  let questionCount = 0;
  let publishedLessons = 0;
  let blockCount = 0;

  for (const courseModule of course.modules) {
    for (const lesson of courseModule.lessons) {
      if (lesson.status === "published") publishedLessons += 1;
      else issues.push({ id: `draft-${lesson.id}`, moduleId: courseModule.id, lessonId: lesson.id, severity: "warning", category: "publishing", title: `${lesson.title} is still a draft`, detail: "Publish it when its content is ready for students." });
      if (lesson.blocks.length === 0) issues.push({ id: `empty-${lesson.id}`, moduleId: courseModule.id, lessonId: lesson.id, severity: "missing", category: "asset", title: `${lesson.title} has no content`, detail: "Add text, a video, a resource, an image, or a practice." });
      for (const block of lesson.blocks) {
        blockCount += 1;
        if (block.kind === "practice") {
          practiceCount += 1;
          questionCount += block.content.practice?.questions.length ?? 0;
        }
        for (const [issueIndex, blockIssue] of issueForBlock(block, courseModule.id, lesson.id).entries()) issues.push({ ...blockIssue, id: `${block.id}-${issueIndex}` });
      }
    }
  }

  const missingAssets = issues.filter((issue) => issue.severity === "missing").length;
  const possible = Math.max(1, blockCount + course.totalLessons);
  const readiness = Math.max(0, Math.round(((possible - missingAssets) / possible) * 100));
  return { issues, missingAssets, practiceCount, questionCount, publishedLessons, readiness };
}
