import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ProfileSettingsCard } from "@/components/settings/ProfileSettingsCard";
import { SettingsPageHeading } from "@/components/settings/SettingsPageHeading";
import { getSession } from "@/lib/auth/session";
import { getSettingsAccount } from "@/lib/settings/data";

export default async function AccountSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const account = await getSettingsAccount(session.email);

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
        />
      ) : (
        <section className="rounded-2xl border border-flag/20 bg-flag-bg p-5">
          <h2 className="font-display text-lg font-extrabold text-navy">Account details unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-navy/58">
            You are signed in, but this identity is not linked to a student profile yet.
          </p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg font-extrabold text-navy">Account actions</h2>
        <div className="mt-4 rounded-2xl border border-navy/10 bg-white p-5 sm:flex sm:items-center sm:justify-between">
          <h3 className="text-sm font-extrabold text-navy">Sign out</h3>
          <SignOutButton className="mt-4 min-h-11 rounded-xl px-5 sm:mt-0" />
        </div>
      </section>
    </>
  );
}
