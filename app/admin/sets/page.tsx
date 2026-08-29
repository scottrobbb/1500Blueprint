import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listAllSets } from "@/lib/flashcards/queries";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSetsList } from "@/components/admin/AdminSetsList";

export default async function AdminSetsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const sets = await listAllSets();
  return (
    <AdminShell active="sets" email={session.email}>
      <AdminSetsList sets={sets} />
    </AdminShell>
  );
}
