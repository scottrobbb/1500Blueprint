import { notFound } from "next/navigation";
import { QuestionBankDashboardView } from "@/components/ultimate/question-bank/QuestionBankDashboard";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getQuestionBankDashboard } from "@/lib/question-bank/queries";
import { getQuestionBankUsage, getStudentAccess } from "@/lib/auth/entitlements";

export const metadata = { title: "Question Bank" };

export default async function UltimateQuestionBankPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [dashboard, access, used] = await Promise.all([getQuestionBankDashboard(session.email), getStudentAccess(session.email), getQuestionBankUsage(session.email)]);
  return <QuestionBankDashboardView dashboard={dashboard} access={{ plan: access.plan, test: access.isTestAccount, used, limit: access.entitlements.questionBankLimit }} />;
}
