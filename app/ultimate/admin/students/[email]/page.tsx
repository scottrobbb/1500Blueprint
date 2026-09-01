import { notFound } from "next/navigation";
import { StudentDetail } from "@/components/admin/StudentDetail";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { studentEmailFromParam } from "@/lib/admin/student-lookup";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getHubState, listAllTestAttempts, listStudents } from "@/lib/gamification/state";
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

  const [progress, attempts, tests] = await Promise.all([
    getHubState(student.email).catch(() => null),
    listAllTestAttempts(student.email),
    listTests({ includeDraft: true }),
  ]);
  const testTitles = Object.fromEntries(tests.map((test) => [test.slug, test.title]));

  return (
    <UltimateAdminFrame active="students" email={session.email}>
      <StudentDetail
        student={student}
        progress={progress}
        attempts={attempts}
        testTitles={testTitles}
      />
    </UltimateAdminFrame>
  );
}
