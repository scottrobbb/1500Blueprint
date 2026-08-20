import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/ultimate/PageHeader";
import { StudyPlanner } from "@/components/ultimate/StudyPlanner";
import { AccessGate } from "@/components/account/AccessGate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getHubState } from "@/lib/gamification/state";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";

export const metadata = { title: "Study Planner" };

export default async function PlannerPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const access = await getStudentAccess(session.email);
  if (!access.entitlements.studyPlanner) {
    return <AccessGate title="Build a personal study plan" description="The adaptive study planner, score goals, and weekly schedule are included with Max." currentPlan={access.plan} />;
  }
  const [hub, profile] = await Promise.all([getHubState(session.email), getStudyPlannerProfile(session.email)]);

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-7">
      <PageHeader
        eyebrow="Study planner"
        title="Build this week around real practice."
        description="Set your score target and availability now. The plan will connect to Scott-authored course, bank, and drill content as that catalog is completed."
      />

      <section className="mb-5 rounded-[18px] bg-[linear-gradient(125deg,#0b2a5b,#174778)] p-6 text-white sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky">Today</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">{hub.dailyGoal.done} of {hub.dailyGoal.total} daily drills complete</h2>
          <p className="mt-1 text-sm text-white/60">Keep the current {hub.player.streak}-day streak moving.</p>
        </div>
        <Link href="/ultimate/drills" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white sm:mt-0">
          Continue today <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </section>

      <StudyPlanner initialProfile={profile} />
    </div>
  );
}
