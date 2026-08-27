import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { PostDetail } from "@/components/community/PostDetail";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { hasStaffRole } from "@/lib/auth/staff";
import { getHubState } from "@/lib/gamification/state";
import { getPost } from "@/lib/community/queries";

export const dynamic = "force-dynamic";

// Next 16: route params are async.
export default async function CommunityPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const [hub, post, isExplanationEditor] = await Promise.all([
    getHubState(session.email),
    getPost(id, session.email),
    hasStaffRole(session.email, "explanation_editor"),
  ]);
  if (!post) notFound();

  const isAdmin = isAdminEmail(session.email);
  const nav = {
    streak: hub.player.streak,
    level: hub.player.level,
    xp: hub.player.xp,
    name: hub.player.name,
    initials: hub.player.initials,
    avatarUrl: hub.player.avatarUrl,
    plan: hub.player.plan,
    isAdmin,
    isExplanationEditor,
  };
  const user = {
    name: hub.player.name,
    initials: hub.player.initials,
    handle: session.email.split("@")[0],
    level: hub.player.level,
    avatarUrl: hub.player.avatarUrl,
  };

  return (
    <div className="min-h-dvh bg-haze text-ink">
      <AppNav activePage="community" stats={nav} />
      <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-7 sm:px-6">
        <PostDetail post={post} user={user} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
