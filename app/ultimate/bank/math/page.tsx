import { notFound } from "next/navigation";
import { MathBankCatalogView } from "@/components/ultimate/question-bank/math/MathBankCatalog";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getMathBankCatalog } from "@/lib/question-bank/math-queries";

export const metadata = { title: "Math Question Bank" };

export default async function UltimateMathBankPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const catalog = await getMathBankCatalog(session.email);
  return <MathBankCatalogView catalog={catalog} />;
}
