import { notFound } from "next/navigation";
import { CommunityModeration } from "@/components/admin/CommunityModeration";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listPosts } from "@/lib/community/queries";

export const dynamic = "force-dynamic";

export default async function UltimateAdminCommunityPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  const posts = await listPosts(session.email);
  return (
    <UltimateAdminFrame active="community" email={session.email}>
      <CommunityModeration initialPosts={posts} communityBase="/ultimate/community" />
    </UltimateAdminFrame>
  );
}
