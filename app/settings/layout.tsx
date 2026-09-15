import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsIcon } from "@/components/shell/icons";
import { ArrowLeftIcon } from "@/components/test/icons";
import { SettingsNavigation } from "@/components/settings/SettingsNavigation";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Settings — 1500 Blueprint",
  description: "Manage your 1500 Blueprint account, plan, and billing.",
  robots: { index: false, follow: false },
};

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect(
      isPasswordAuthEnabled()
        ? "/account/login?next=%2Fsettings%2Faccount"
        : "/login",
    );
  }

  return (
    <div className="min-h-dvh bg-haze text-ink">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8 lg:pt-14">
        <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start">
          <aside className="lg:sticky lg:top-8">
            <Link
              href="/ultimate"
              className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-navy/55 transition-colors hover:bg-navy/[0.045] hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ArrowLeftIcon className="h-4 w-4" /> Back to home
            </Link>
            <div className="mb-8 flex items-center gap-3 px-1">
              <SettingsIcon className="h-6 w-6 flex-none text-navy/45 lg:h-7 lg:w-7" />
              <h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-navy">Settings</h2>
            </div>
            <SettingsNavigation />
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
