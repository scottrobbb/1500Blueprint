import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

// Admin chrome wrapper: sticky top bar (mark + title, section tabs, signed-in
// email, exit link) with the page body in a centered container below. Active tab
// is a pure function of the `active` prop, so this stays a server component —
// no client interactivity is required.

export type AdminShellProps = {
  active: "bank" | "reports" | "tests" | "students" | "access" | "settings" | "sets" | "community";
  email: string;
  children: ReactNode;
};

const tabs = [
  { key: "bank", label: "Question Bank", href: "/admin" },
  { key: "reports", label: "Reports", href: "/admin/reports" },
  { key: "tests", label: "Practice Tests", href: "/admin/tests" },
  { key: "sets", label: "Flashcard Sets", href: "/admin/sets" },
  { key: "community", label: "Community", href: "/admin/community" },
  { key: "students", label: "Students", href: "/admin/students" },
  { key: "access", label: "Complimentary", href: "/admin/access" },
  { key: "settings", label: "Drill Settings", href: "/admin/drills" },
] as const;

export function AdminShell({ active, email, children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 border-b border-navy/12 bg-white/[0.92] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:gap-6 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo withWordmark={false} className="[&>img]:h-7 [&>img]:w-7" />
            <div className="leading-tight">
              <div className="font-display text-base font-extrabold tracking-tight text-navy">
                Drill Admin
              </div>
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-navy/40">
                1500 Blueprint
              </div>
            </div>
          </div>

          <nav
            className="order-3 flex w-full items-center gap-1 overflow-x-auto pb-1 lg:order-none lg:w-auto lg:pb-0"
            aria-label="Admin sections"
          >
            {tabs.map((tab) => {
              const isActive = tab.key === active;
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-card px-3.5 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-navy text-white"
                      : "text-navy/60 hover:bg-navy/5 hover:text-navy"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <span className="hidden text-sm text-navy/55 sm:inline" title={email}>
              {email}
            </span>
            <Link
              href="/drills"
              className="rounded-card border border-navy/20 bg-white px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-navy/5"
            >
              Back to drills
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-6 py-8">{children}</main>
    </div>
  );
}
