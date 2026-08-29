import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listDrills, listQuestions, listSkills } from "@/lib/drills/admin-queries";
import { AdminShell } from "@/components/admin/AdminShell";
import { QuestionBank } from "@/components/admin/QuestionBank";

// Admin landing: the question bank. Authorizes first, then loads the reference
// data + page 1 of questions on the server so the first paint is data-complete.
export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const [drills, skills, { questions, total }] = await Promise.all([
    listDrills(),
    listSkills(),
    listQuestions({}, 1, 25),
  ]);

  return (
    <AdminShell active="bank" email={session.email}>
      <QuestionBank
        initialQuestions={questions}
        total={total}
        drills={drills}
        skills={skills}
      />
    </AdminShell>
  );
}
