import { notFound } from "next/navigation";
import { AdminSetsList } from "@/components/admin/AdminSetsList";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listAllSets } from "@/lib/flashcards/queries";

export default async function UltimateAdminSetsPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  const sets = await listAllSets();
  return (
    <UltimateAdminFrame active="sets" email={session.email}>
      <AdminSetsList sets={sets} basePath="/ultimate/admin/sets" />
    </UltimateAdminFrame>
  );
}
