import { notFound } from "next/navigation";
import { StudyPlanner } from "@/components/ultimate/StudyPlanner";
import { AccessGate } from "@/components/account/AccessGate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getOrCreateStudyPlan } from "@/lib/study-planner/plan";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";

export const metadata = { title: "Study Planner" };

export default async function PlannerPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const access = await getStudentAccess(session.email);
  if (!access.entitlements.studyPlanner) {
    return <AccessGate title="Build a personal study plan" description="The adaptive study planner, score goals, and weekly schedule are included with Max." currentPlan={access.plan} />;
  }
  const profile = await getStudyPlannerProfile(session.email);
  const plan = profile ? await getOrCreateStudyPlan(session.email, profile) : null;

  return (
    <div className="mx-auto w-full max-w-[1024px] px-4 pb-10 pt-8 sm:px-6">
      <StudyPlanner initialProfile={profile} initialPlan={plan} />
    </div>
  );
}
