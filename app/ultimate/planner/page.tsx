import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ultimate/PageHeader";
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
    return <AccessGate title="The study planner is included with Max" description="Set a score goal, test date, study days, and weekly schedule." currentPlan={access.plan} />;
  }
  const profile = await getStudyPlannerProfile(session.email);
  const plan = profile ? await getOrCreateStudyPlan(session.email, profile) : null;

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-7">
      <PageHeader
        eyebrow="Study planner"
        title="Your weekly study plan"
        description="The planner uses your lessons, Question Bank accuracy, test history, score goal, and available study days to schedule the next week."
      />
      <StudyPlanner initialProfile={profile} initialPlan={plan} />
    </div>
  );
}
