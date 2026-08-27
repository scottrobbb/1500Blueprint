import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/shell/AppNav";
import { SettingsNavigation } from "@/components/settings/SettingsNavigation";
import { isPasswordAuthEnabled } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { getNavStats } from "@/lib/gamification/state";

export const metadata: Metadata = {
  title: "Settings — 1500 SAT Blueprint",
  description: "Manage your 1500 SAT Blueprint account, plan, and billing.",
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

  const nav = await getNavStats(session.email);

  return (
    <div className="min-h-dvh bg-haze text-ink">
      <AppNav activePage="settings" stats={nav} />
      <div className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-8 sm:px-6 sm:pt-11">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-navy text-sky shadow-sm">
            <SettingsIcon className="h-5 w-5" />
          </span>
          <h2 className="font-display text-xl font-extrabold text-navy">Settings</h2>
        </div>

        <div className="grid gap-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-9">
          <aside className="lg:sticky lg:top-24">
            <div className="mb-6 hidden items-center gap-3 px-2 lg:flex">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy text-sky shadow-sm">
                <SettingsIcon className="h-5 w-5" />
              </span>
              <h2 className="font-display text-lg font-extrabold text-navy">Settings</h2>
            </div>
            <SettingsNavigation />
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.8-1.8l.9-2-2.1-2.1-2 .9a7 7 0 0 0-1.8-.8l-.7-2h-3l-.7 2a7 7 0 0 0-1.8.8l-2-.9L.9 6l.9 2a7 7 0 0 0-.8 1.8l-2 .7v3l2 .7a7 7 0 0 0 .8 1.8l-.9 2L3 20.1l2-.9a7 7 0 0 0 1.8.8l.7 2h3l.7-2a7 7 0 0 0 1.8-.8l2 .9 2.1-2.1-.9-2a7 7 0 0 0 .8-1.8Z" transform="translate(2) scale(.83)" strokeLinejoin="round" />
    </svg>
  );
}
