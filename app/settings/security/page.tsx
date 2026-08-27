import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsPageHeading } from "@/components/settings/SettingsPageHeading";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { getSettingsAccount } from "@/lib/settings/data";

export default async function SecuritySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const account = await getSettingsAccount(session.email);
  const passwordEnabled = isPasswordAuthEnabled();
  const hasPassword = account?.hasPasswordIdentity ?? session.authMethod === "password";

  return (
    <>
      <SettingsPageHeading title="Security" />

      <div>
        {passwordEnabled ? (
          <section>
            <h2 className="font-display text-lg font-extrabold text-navy">Password</h2>
            <div className="mt-4 flex flex-col gap-4 rounded-2xl border-2 border-navy/10 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h3 className="text-sm font-extrabold text-navy">
                  {hasPassword ? "Change password" : "Create a password"}
                </h3>
                <p className="mt-1 text-xs font-semibold text-navy/45">
                  {hasPassword ? "A secure reset link will be sent by email." : "Use your account email and a password to sign in."}
                </p>
              </div>
              <Link
                href={hasPassword ? "/account/forgot-password" : "/account/claim?next=%2Fsettings%2Fsecurity"}
                className="inline-flex min-h-11 flex-none items-center justify-center rounded-xl border-2 border-navy/10 px-5 text-sm font-extrabold text-navy transition-colors hover:border-brand/30 hover:text-brand-600"
              >
                {hasPassword ? "Reset password" : "Create password"}
              </Link>
            </div>
          </section>
        ) : null}

      </div>
    </>
  );
}
