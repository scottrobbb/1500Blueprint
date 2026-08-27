import { redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { RightRail } from "@/components/community/RightRail";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { hasStaffRole } from "@/lib/auth/staff";
import { getHubState } from "@/lib/gamification/state";
import { listPosts, listTopMembers } from "@/lib/community/queries";

export const metadata = {
  title: "Community | 1500 SAT Blueprint",
  description:
    "Share score drops, wins, and questions with other 1500 SAT Blueprint students.",
};

// Always render fresh so a new post shows on navigation back to the feed.
export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [hub, posts, topMembers, isExplanationEditor] = await Promise.all([
    getHubState(session.email),
    listPosts(session.email),
    listTopMembers(),
    hasStaffRole(session.email, "explanation_editor"),
  ]);
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

      <div className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-7 sm:px-6">
        <h1 className="mb-4 font-display text-xl font-extrabold tracking-[-0.01em] text-navy">Community</h1>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_308px]">
          <CommunityFeed initialPosts={posts} user={user} isAdmin={isAdmin} />
          <RightRail topMembers={topMembers} />
        </div>
      </div>

      <footer className="mx-auto w-full max-w-[1120px] px-6 pb-10 text-center text-xs text-navy/40">
        1500 SAT Blueprint practice platform. Not affiliated with the College Board. SAT is a trademark of the College
        Board.
      </footer>
    </div>
  );
}
