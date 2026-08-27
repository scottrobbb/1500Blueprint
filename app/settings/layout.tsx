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
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8 lg:pt-14">
        <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start">
          <aside className="lg:sticky lg:top-24">
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

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h4M12 12h8" strokeLinecap="round" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
      <circle cx="10" cy="12" r="2" />
    </svg>
  );
}
