import { redirect } from "next/navigation";
import { HomePracticeList } from "@/components/home/HomePracticeList";
import { AppNav } from "@/components/shell/AppNav";
import { ContinueStudy } from "@/components/hub/ContinueStudy";
import { HomeOverview } from "@/components/hub/HomeOverview";
import { HomeProgress } from "@/components/hub/HomeProgress";
import { StudyPathways } from "@/components/hub/StudyPathways";
import { getSession } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { hasStaffRole } from "@/lib/auth/staff";
import { getHomeState, getTestProgress } from "@/lib/gamification/state";
import { listDrills } from "@/lib/drills/admin-queries";
import { getHomeContinuation } from "@/lib/home/continuation";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";

export const metadata = {
  title: "Home | 1500 Blueprint",
  description:
    "Continue studying, practice an SAT skill, take a full test, or review your work.",
};

export default async function DrillsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [home, continuation, drills, isExplanationEditor, plannerProfile, testProgress] = await Promise.all([
    getHomeState(session.email),
    getHomeContinuation(session.email),
    listDrills(),
    hasStaffRole(session.email, "explanation_editor"),
    getStudyPlannerProfile(session.email).catch(() => null),
    getTestProgress(session.email),
  ]);
  const nav = {
    streak: home.player.streak,
    level: home.player.level,
    xp: home.player.xp,
    name: home.player.name,
    initials: home.player.initials,
    avatarUrl: home.player.avatarUrl,
    plan: home.player.plan,
    isAdmin: isAdminEmail(session.email),
    isExplanationEditor,
  };
  const publication = Object.fromEntries(drills.map((drill) => [drill.slug, drill.status]));

  return (
    <div className="min-h-dvh bg-haze text-ink">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[120] -translate-y-20 rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <AppNav activePage="drills" stats={nav} showProgress={false} />
      <main id="main-content" tabIndex={-1}>
        <HomeOverview firstName={home.player.firstName} />
        <section aria-labelledby="today-heading" className="mx-auto w-full max-w-[1080px] px-4 pt-8 sm:px-6">
          <h2 id="today-heading" className="mb-3 font-display text-lg font-semibold text-navy">
            Today
          </h2>
          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
            <ContinueStudy
              continuation={continuation}
              dailyGoal={home.dailyGoal}
              isAdmin={nav.isAdmin}
              publication={publication}
            />
            <HomeProgress profile={plannerProfile} testProgress={testProgress} />
          </div>
        </section>
        <StudyPathways profile={plannerProfile} plan={home.player.plan} />
        <HomePracticeList
          isAdmin={nav.isAdmin}
          publication={publication}
        />
      </main>
    </div>
  );
}
