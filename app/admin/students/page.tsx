import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listStudents } from "@/lib/gamification/state";
import { AdminShell } from "@/components/admin/AdminShell";
import { StudentsTable } from "@/components/admin/StudentsTable";

// Admin students roster: every account with XP/streak, per-drill mastery, and
// best practice-test score. Authorizes first, then loads the full roster on the
// server (sorted by XP) so the first paint is data-complete.
export default async function AdminStudentsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const students = await listStudents();

  return (
    <AdminShell active="students" email={session.email}>
      <StudentsTable students={students} />
    </AdminShell>
  );
}
