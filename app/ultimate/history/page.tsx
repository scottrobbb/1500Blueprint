import { notFound } from "next/navigation";
import { HistoryView } from "@/components/history/HistoryView";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { loadHistory } from "@/lib/drills/progress";
import { getStudentProgress } from "@/lib/progress/queries";
import { withLessonProgress } from "@/lib/progress/summary";
import { listCoursesForStudent } from "@/lib/courses/queries";
import { canAccessCourse, getStudentAccess } from "@/lib/auth/entitlements";

export const metadata = { title: "History" };

export default async function UltimateHistoryPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [entries, savedProgress, courses, access] = await Promise.all([
    loadHistory(session.email),
    getStudentProgress(session.email),
    listCoursesForStudent(session.email),
    getStudentAccess(session.email),
  ]);
  const availableCourses = courses.filter((course) => canAccessCourse(access, course.slug));
  const progress = withLessonProgress(savedProgress, {
    completed: availableCourses.reduce((sum, course) => sum + course.completedLessons, 0),
    total: availableCourses.reduce((sum, course) => sum + course.totalLessons, 0),
  });
  return <HistoryView entries={entries} progress={progress} variant="ultimate" drillsHref="/ultimate/drills" />;
}
