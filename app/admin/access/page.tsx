import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ComplimentaryAccessManager } from "@/components/admin/ComplimentaryAccessManager";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listComplimentaryAccessUsers } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export default async function AdminComplimentaryAccessPage() {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const users = await listComplimentaryAccessUsers();

  return (
    <AdminShell active="access" email={session.email}>
      <ComplimentaryAccessManager users={users} />
    </AdminShell>
  );
}
