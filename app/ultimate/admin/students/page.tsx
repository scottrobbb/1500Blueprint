import { notFound } from "next/navigation";
import { StudentsTable } from "@/components/admin/StudentsTable";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listStudents } from "@/lib/gamification/state";

export default async function UltimateAdminStudentsPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  const students = await listStudents();
  return (
    <UltimateAdminFrame active="students" email={session.email}>
      <StudentsTable students={students} />
    </UltimateAdminFrame>
  );
}
