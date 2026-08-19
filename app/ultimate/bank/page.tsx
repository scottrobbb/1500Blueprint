import { notFound } from "next/navigation";
import { QuestionBankDashboardView } from "@/components/ultimate/question-bank/QuestionBankDashboard";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getQuestionBankDashboard } from "@/lib/question-bank/queries";

export const metadata = { title: "Question Bank" };

export default async function UltimateQuestionBankPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const dashboard = await getQuestionBankDashboard(session.email);
  return <QuestionBankDashboardView dashboard={dashboard} />;
}
