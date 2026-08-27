import { redirect } from "next/navigation";
import { ProgressSettingsView } from "@/components/settings/ProgressSettingsView";
import { SettingsPageHeading } from "@/components/settings/SettingsPageHeading";
import { getSession } from "@/lib/auth/session";
import { getHubState } from "@/lib/gamification/state";

export default async function ProgressSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const progress = await getHubState(session.email);

  return (
    <>
      <SettingsPageHeading title="Progress" />
      <ProgressSettingsView progress={progress} />
    </>
  );
}
