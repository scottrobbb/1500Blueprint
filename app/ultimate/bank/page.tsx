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

  const access = await getStudentAccess(session.email);
  const dashboard = await getQuestionBankDashboard(session.email, { freeTierOnly: access.plan === "free" });
  const unlimited = access.entitlements.questionBankLimit === "unlimited";
  const used = unlimited ? 0 : await getQuestionBankUsage(session.email);
  return <QuestionBankDashboardView dashboard={dashboard} access={{ plan: access.plan, test: access.isTestAccount, used, limit: access.entitlements.questionBankLimit, challengeQuestions: access.entitlements.challengeQuestions }} />;
}
