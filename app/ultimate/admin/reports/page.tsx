import { notFound } from "next/navigation";
import { QuestionReportsPanel } from "@/components/admin/QuestionReportsPanel";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listQuestionReports } from "@/lib/question-reports/queries";

export const metadata = { title: "Question Reports" };

export default async function UltimateAdminQuestionReportsPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  const reports = await listQuestionReports();

  return (
    <UltimateAdminFrame active="reports" email={session.email}>
      <QuestionReportsPanel initialReports={reports} adminBasePath="/ultimate/admin" />
    </UltimateAdminFrame>
  );
}
