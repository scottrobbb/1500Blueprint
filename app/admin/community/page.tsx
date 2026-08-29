import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { AdminShell } from "@/components/admin/AdminShell";
import { CommunityModeration } from "@/components/admin/CommunityModeration";
import { listPosts } from "@/lib/community/queries";

export const dynamic = "force-dynamic";

// Admin moderation for the community feed. Authorizes first, then loads the
// newest posts for the table.
export default async function AdminCommunityPage() {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const posts = await listPosts(session.email);

  return (
    <AdminShell active="community" email={session.email}>
      <CommunityModeration initialPosts={posts} />
    </AdminShell>
  );
}
