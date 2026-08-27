import { redirect } from "next/navigation";
import { SettingsPageHeading } from "@/components/settings/SettingsPageHeading";
import { StudyPreferencesForm } from "@/components/settings/StudyPreferencesForm";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { getStudyPlannerProfile } from "@/lib/study-planner/profile";

export default async function StudyPreferencesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const access = await getStudentAccess(session.email);
  const enabled = access.active && access.entitlements.studyPlanner;
  const profile = enabled ? await getStudyPlannerProfile(session.email) : null;

  return (
    <>
      <SettingsPageHeading title="Study preferences" />
      <StudyPreferencesForm
        enabled={enabled}
        profile={profile}
        plan={access.plan}
      />
    </>
  );
}
