import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getDrill } from "@/lib/drills/admin-queries";
import { AdminShell } from "@/components/admin/AdminShell";
import { DrillSettingsForm } from "@/components/admin/DrillSettingsForm";
import { VocabBulkImport } from "@/components/admin/VocabBulkImport";

// Per-drill settings editor. Loads the drill config, then renders the form.
export default async function DrillSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const { slug } = await params;
  const drill = await getDrill(slug);
  if (!drill) notFound();

  return (
    <AdminShell active="settings" email={session.email}>
      <div className="mb-4">
        <Link
          href="/admin/drills"
          className="text-[13px] font-semibold text-navy/55 transition-colors hover:text-navy"
        >
          ← All drills
        </Link>
      </div>
      <DrillSettingsForm drill={drill} />
      {slug === "vocab" ? <VocabBulkImport /> : null}
    </AdminShell>
  );
}
