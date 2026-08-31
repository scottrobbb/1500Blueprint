import { redirect } from "next/navigation";
import { SettingsPageHeading } from "@/components/settings/SettingsPageHeading";
import { SubscriptionSettingsView } from "@/components/settings/SubscriptionSettingsView";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionSettings } from "@/lib/settings/data";
import { buildSettingsPlanView } from "@/lib/settings/plan-view";

export default async function SubscriptionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [data, params] = await Promise.all([
    getSubscriptionSettings(session.email),
    searchParams,
  ]);
  const planView = buildSettingsPlanView(
    data.access.entitlements,
    {
      questionBankUsed: data.questionBankUsed,
      drillsUsedToday: data.drillsUsedToday,
    },
    data.access.plan,
  );

  return (
    <>
      <SettingsPageHeading
        title="Subscription"
      />
      <SubscriptionSettingsView
        data={data}
        planView={planView}
        billingState={params.billing}
      />
    </>
  );
}
