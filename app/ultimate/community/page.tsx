import { notFound } from "next/navigation";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { RightRail } from "@/components/community/RightRail";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { listPosts, listTopMembers } from "@/lib/community/queries";
import { getHubState } from "@/lib/gamification/state";

export const metadata = { title: "Community" };
export const dynamic = "force-dynamic";

export default async function UltimateCommunityPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [hub, posts, topMembers] = await Promise.all([
    getHubState(session.email),
    listPosts(session.email),
    listTopMembers(),
  ]);
  const user = {
    name: hub.player.name,
    initials: hub.player.initials,
    handle: session.email.split("@")[0],
    level: hub.player.level,
    avatarUrl: hub.player.avatarUrl,
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-7 sm:px-7">
      <section className="relative mb-5 overflow-hidden rounded-[18px] bg-[linear-gradient(125deg,#0b2a5b,#174778)] p-6 text-white shadow-pop sm:p-7">
        <div aria-hidden="true" className="absolute -right-10 -top-16 h-48 w-48 rounded-full border-[28px] border-sky/10" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-sky">Student community</p>
            <h1 className="mt-1 font-display text-[32px] font-extrabold tracking-[-0.03em]">Learn with the crew.</h1>
            <p className="mt-2 text-sm leading-6 text-white/65">Share score drops, work through hard questions, and celebrate wins with everyone building toward 1500.</p>
          </div>
          <div className="flex gap-3 text-center">
            <div className="rounded-xl bg-white/10 px-4 py-2.5">
              <strong className="block font-display text-xl text-white">{posts.length}</strong>
              <span className="text-[10px] text-white/50">posts</span>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-2.5">
              <strong className="block font-display text-xl text-white">{topMembers.length}</strong>
              <span className="text-[10px] text-white/50">top members</span>
            </div>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_308px]">
        <CommunityFeed
          initialPosts={posts}
          user={user}
          isAdmin={isAdminEmail(session.email)}
          threadHrefBase="/ultimate/community"
          variant="ultimate"
        />
        <RightRail topMembers={topMembers} variant="ultimate" />
      </div>
    </div>
  );
}
