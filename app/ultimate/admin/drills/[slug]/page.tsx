import Link from "next/link";
import { notFound } from "next/navigation";
import { DrillSettingsForm } from "@/components/admin/DrillSettingsForm";
import { VocabBulkImport } from "@/components/admin/VocabBulkImport";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getDrill } from "@/lib/drills/admin-queries";

export default async function UltimateDrillSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getAdminSession();
  if (!session) notFound();
  const { slug } = await params;
  const drill = await getDrill(slug);
  if (!drill) notFound();

  return (
    <UltimateAdminFrame active="drills" email={session.email}>
      <Link href="/ultimate/admin/drills" className="mb-4 inline-flex min-h-10 items-center text-sm font-bold text-navy/50 hover:text-navy">← All drills</Link>
      <DrillSettingsForm drill={drill} backHref="/ultimate/admin/drills" />
      {slug === "vocab" ? <VocabBulkImport /> : null}
    </UltimateAdminFrame>
  );
}
