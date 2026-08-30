import { notFound } from "next/navigation";
import { MathBankCatalogView } from "@/components/ultimate/question-bank/math/MathBankCatalog";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getMathBankCatalog } from "@/lib/question-bank/math-queries";
import { getStudentAccess } from "@/lib/auth/entitlements";

export const metadata = { title: "Math Question Bank" };

export default async function UltimateMathBankPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const access = await getStudentAccess(session.email);
  const catalog = await getMathBankCatalog(session.email, {
    includeChallenge: access.entitlements.challengeQuestions,
    freeTierOnly: access.plan === "free",
  });
  return <MathBankCatalogView catalog={catalog} challengeLocked={!access.entitlements.challengeQuestions} currentPlan={access.plan} />;
}
