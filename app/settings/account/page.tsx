import { redirect } from "next/navigation";
import { ProfileSettingsCard } from "@/components/settings/ProfileSettingsCard";
import { SettingsPageHeading } from "@/components/settings/SettingsPageHeading";
import { getSession } from "@/lib/auth/session";
import { getAccountSettings } from "@/lib/settings/data";

export default async function AccountSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await getAccountSettings(session.email);
  const { account } = data;

  return (
    <>
      <SettingsPageHeading
        title="Account"
      />

      {account ? (
        <ProfileSettingsCard
          name={account.name}
          email={account.email}
          avatarUrl={account.avatarUrl}
          createdAt={account.createdAt}
          plan={data.plan}
          xp={account.xp}
          level={data.level}
          currentStreak={account.currentStreak}
          longestStreak={account.longestStreak}
          weeklyRank={data.weeklyRank}
          achievementCount={data.achievementCount}
          achievementTotal={data.achievementTotal}
          achievements={data.achievements}
          testDate={data.testDate}
        />
      ) : (
        <section className="rounded-2xl border border-flag/20 bg-flag-bg p-5">
          <h2 className="font-display text-lg font-extrabold text-navy">Account details unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-navy/58">
            You are signed in, but this identity is not linked to a student profile yet.
          </p>
        </section>
      )}

    </>
  );
}
