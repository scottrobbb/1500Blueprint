import { notFound } from "next/navigation";
import { QuestionBankDashboardView } from "@/components/ultimate/question-bank/QuestionBankDashboard";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getQuestionBankDashboard } from "@/lib/question-bank/queries";
import { getQuestionBankUsage, getStudentAccess } from "@/lib/auth/entitlements";
import { PlanBadge } from "@/components/account/PlanBadge";
import Link from "next/link";

export const metadata = { title: "Question Bank" };

export default async function UltimateQuestionBankPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [dashboard, access, used] = await Promise.all([getQuestionBankDashboard(session.email), getStudentAccess(session.email), getQuestionBankUsage(session.email)]);
  return <><div className="mx-auto mt-6 flex w-[calc(100%-2rem)] max-w-[1120px] flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-ice/60 px-4 py-3 sm:w-[calc(100%-3.5rem)]"><div className="flex items-center gap-2.5"><PlanBadge plan={access.plan} test={access.isTestAccount} /><span className="text-xs font-semibold text-navy/55">{Math.min(used, access.entitlements.questionBankLimit).toLocaleString()} of {access.entitlements.questionBankLimit.toLocaleString()} included questions used</span></div>{access.plan !== "max" ? <Link href="/pricing" className="text-xs font-extrabold text-brand-700">Compare plans →</Link> : null}</div><QuestionBankDashboardView dashboard={dashboard} /></>;
}
