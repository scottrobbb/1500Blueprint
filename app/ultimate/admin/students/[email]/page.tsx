import { notFound } from "next/navigation";
import { StudentDetail } from "@/components/admin/StudentDetail";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { studentEmailFromParam } from "@/lib/admin/student-lookup";
import { canAccessCourse, getStudentAccess } from "@/lib/auth/entitlements";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listCoursesForStudentStrict } from "@/lib/courses/queries";
import { getHubState, listAllTestAttempts, listStudents } from "@/lib/gamification/state";
import { getQuestionBankDashboard } from "@/lib/question-bank/queries";
import { listTests } from "@/lib/sat/loadTest";

export const metadata = { title: "Student" };

// Everything a student sees about their own progress, read-only, for one
// student.
export default async function UltimateAdminStudentPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const session = await getAdminSession();
  if (!session) notFound();

  const { email: rawEmail } = await params;
  const email = studentEmailFromParam(rawEmail);

  // listStudents applies the plan/billing derivation the roster already uses, so
  // the detail page cannot disagree with the row the admin clicked.
  const students = await listStudents();
  const student = students.find((row) => row.email.toLowerCase() === email);
  if (!student) notFound();

  const [progress, attempts, tests, courses, access] = await Promise.all([
    getHubState(student.email).catch(() => null),
    listAllTestAttempts(student.email),
    listTests({ includeDraft: true }),
    listCoursesForStudentStrict(student.email).catch(() => null),
    getStudentAccess(student.email).catch(() => null),
  ]);
  const testTitles = Object.fromEntries(tests.map((test) => [test.slug, test.title]));
  // The same free-tier scoping the student's own Question Bank page applies, so
  // "available" counts match what they see.
  const questionBank = await getQuestionBankDashboard(student.email, {
    freeTierOnly: (access?.plan ?? student.plan) === "free",
  }).catch(() => null);
  const courseProgress = courses?.map((course) => ({
    course,
    locked: access ? !canAccessCourse(access, course.slug) : false,
  })) ?? null;

  return (
    <UltimateAdminFrame active="students" email={session.email}>
      <StudentDetail
        student={student}
        progress={progress}
        attempts={attempts}
        testTitles={testTitles}
        courses={courseProgress}
        questionBank={questionBank}
      />
    </UltimateAdminFrame>
  );
}
