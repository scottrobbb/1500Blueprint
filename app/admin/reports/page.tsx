import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { QuestionReportsPanel } from "@/components/admin/QuestionReportsPanel";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listQuestionReports } from "@/lib/question-reports/queries";

export const metadata = { title: "Question Reports" };

export default async function AdminQuestionReportsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/drills");
  const reports = await listQuestionReports();

  return (
    <AdminShell active="reports" email={session.email}>
      <QuestionReportsPanel initialReports={reports} adminBasePath="/admin" />
    </AdminShell>
  );
}
