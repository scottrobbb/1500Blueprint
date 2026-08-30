import { notFound } from "next/navigation";
import { ReadingWritingBankCatalogView } from "@/components/ultimate/question-bank/reading-writing/ReadingWritingBankCatalog";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getReadingWritingBankCatalog } from "@/lib/question-bank/reading-writing-queries";
import { getStudentAccess } from "@/lib/auth/entitlements";

export const metadata = { title: "Reading & Writing Question Bank" };

export default async function UltimateReadingWritingBankPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const access = await getStudentAccess(session.email);
  const catalog = await getReadingWritingBankCatalog(session.email, {
    includeChallenge: access.entitlements.challengeQuestions,
    freeTierOnly: access.plan === "free",
  });
  return <ReadingWritingBankCatalogView catalog={catalog} challengeLocked={!access.entitlements.challengeQuestions} currentPlan={access.plan} />;
}
