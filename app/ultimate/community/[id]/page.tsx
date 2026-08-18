import { notFound } from "next/navigation";
import { PostDetail } from "@/components/community/PostDetail";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getPost } from "@/lib/community/queries";
import { getHubState } from "@/lib/gamification/state";

export const dynamic = "force-dynamic";

export default async function UltimateCommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const { id } = await params;
  const [hub, post] = await Promise.all([getHubState(session.email), getPost(id, session.email)]);
  if (!post) notFound();

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-7 sm:px-6">
      <PostDetail
        post={post}
        user={{
          name: hub.player.name,
          initials: hub.player.initials,
          handle: session.email.split("@")[0],
          level: hub.player.level,
          avatarUrl: hub.player.avatarUrl,
        }}
        isAdmin={isAdminEmail(session.email)}
        backHref="/ultimate/community"
      />
    </div>
  );
}
