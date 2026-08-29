"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactElement } from "react";
import { Logo } from "@/components/Logo";
import { LockIcon } from "@/components/account/UpgradePrompt";
import { CommunityIcon } from "@/components/community/icons";
import { LayersIcon } from "@/components/flashcards/icons";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { NotificationBell } from "@/components/shell/NotificationBell";
import {
  DrillsIcon,
  FlameIcon,
  HistoryIcon,
  ShieldIcon,
  TestsIcon,
} from "@/components/shell/icons";
import type { NavStats } from "@/lib/gamification";
import type { StudentAccess } from "@/lib/auth/plans";

type IconProps = { className?: string };
type NavItem = {
  href: string;
  label: string;
  Icon: (props: IconProps) => ReactElement;
  chip?: string;
  requires?: "drills" | "planner" | "live";
};

const navigation: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/ultimate", label: "Home", Icon: HomeIcon },
    ],
  },
  {
    title: "Learning",
    items: [
      { href: "/ultimate/planner", label: "Study Planner", Icon: CalendarIcon, chip: "New", requires: "planner" },
      { href: "/ultimate/live-calls", label: "Weekly Calls", Icon: VideoIcon, requires: "live" },
      { href: "/ultimate/courses", label: "Courses", Icon: CoursesIcon },
    ],
  },
  {
    title: "Practice",
    items: [
      { href: "/ultimate/bank", label: "Question Bank", Icon: QuestionBankIcon, chip: "New" },
      { href: "/ultimate/drills", label: "Drills", Icon: DrillsIcon, requires: "drills" },
      { href: "/ultimate/tests", label: "Full-Length Tests", Icon: TestsIcon },
      { href: "/ultimate/flashcards", label: "Flashcards", Icon: LayersIcon },
      { href: "/ultimate/history", label: "History", Icon: HistoryIcon },
    ],
  },
  {
    title: "Connect",
    items: [
      { href: "/ultimate/community", label: "Community", Icon: CommunityIcon },
    ],
  },
];

export function UltimateShell({
  stats,
  access,
  children,
}: {
  stats: NavStats;
  access: StudentAccess;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  if (
    pathname.startsWith("/ultimate/bank/math/practice")
    || pathname.startsWith("/ultimate/bank/reading-writing/practice")
  ) {
    return <main className="min-h-dvh bg-white">{children}</main>;
  }

  const rail = (
    <div className="flex h-full flex-col">
      <Link href="/ultimate" className="mx-2 mb-7 flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
        <Logo withWordmark={false} className="[&>img]:h-7 [&>img]:w-7" />
        <span className="leading-none">
          <strong className="block font-display text-[15px] font-extrabold tracking-tight text-white">
            1500 Blueprint
          </strong>
          <span className="mt-1 block text-[11px] font-medium text-sky">by Scott Robinson</span>
        </span>
      </Link>

      <nav aria-label="Ultimate workspace" className="min-h-0 flex-1 overflow-y-auto">
        {navigation.map((section, index) => (
          <div key={section.title ?? index} className="mb-2.5">
            {section.title && (
              <p className="mx-2 mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <RailLink
                  key={item.href}
                  item={item}
                  active={isActivePath(pathname, item.href)}
                  locked={!canUse(item, access)}
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
            </div>
          </div>
        ))}

        {stats.isAdmin && (
          <div className="mb-2.5">
            <p className="mx-2 mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
              Scott
            </p>
            <RailLink
              item={{ href: "/ultimate/admin", label: "Admin Panel", Icon: ShieldIcon }}
              active={isActivePath(pathname, "/ultimate/admin")}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
        )}

        {stats.isExplanationEditor && !stats.isAdmin && (
          <div className="mb-2.5">
            <p className="mx-2 mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
              Staff
            </p>
            <RailLink
              item={{ href: "/manager", label: "Explanation Manager", Icon: EditIcon }}
              active={isActivePath(pathname, "/manager")}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
        )}
      </nav>

      <div className="mt-3 border-t border-white/10 pt-3">
        {access.plan !== "max" ? (
          <Link href="/pricing" onClick={() => setMenuOpen(false)} className="mb-2.5 flex min-h-14 items-center gap-3 rounded-xl border border-sky/15 bg-sky/[0.08] px-3 py-2.5 text-white transition-colors hover:border-sky/30 hover:bg-sky/[0.13]">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-gold/15 text-gold"><LockIcon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold">{access.plan === "free" ? "Unlock Core" : "Go Max"}</strong><span className="mt-0.5 block truncate text-[10px] text-white/50">{access.plan === "free" ? "Drills, Challenge sets, more tests" : "Planner, courses, weekly calls"}</span></span>
            <span className="text-sm text-sky">→</span>
          </Link>
        ) : null}
        <div className="mb-2 grid grid-cols-2 divide-x divide-white/10 rounded-xl bg-white/[0.06] py-2.5">
          <div className="px-3">
            <span className="flex items-center gap-1 text-xs font-bold text-gold">
              <FlameIcon className="h-4 w-4" /> {stats.streak}
            </span>
            <span className="mt-0.5 block text-[10px] text-white/55">day streak</span>
          </div>
          <div className="px-3">
            <span className="text-xs font-bold text-white">{stats.xp.toLocaleString()} XP</span>
            <span className="mt-0.5 block text-[10px] text-white/55">level {stats.level}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <AccountMenu
            name={stats.name}
            initials={stats.initials}
            level={stats.level}
            plan={stats.plan}
            avatarUrl={stats.avatarUrl}
            wide
            tone="dark"
            test={access.isTestAccount}
            billing={access.source === "subscription"}
          />
          <NotificationBell tone="dark" communityHrefBase="/ultimate/community" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[#f5f7fa] text-ink lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <a href="#ultimate-main" className="sr-only z-[80] rounded-md bg-white px-4 py-2 text-sm font-semibold text-navy focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      <aside className="sticky top-0 hidden h-dvh border-r border-white/10 bg-[#0c2348] px-3 pb-3 pt-5 lg:block">{rail}</aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-navy/10 bg-white/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-navy hover:bg-navy/5"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <Link href="/ultimate" className="min-w-0 flex-1">
            <Logo className="[&>img]:h-7 [&>img]:w-7 [&_span]:text-sm" />
          </Link>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-flag">
            <FlameIcon className="h-4 w-4" /> {stats.streak}
          </span>
          <NotificationBell communityHrefBase="/ultimate/community" />
          <AccountMenu
            name={stats.name}
            initials={stats.initials}
            level={stats.level}
            plan={stats.plan}
            avatarUrl={stats.avatarUrl}
            billing={access.source === "subscription"}
          />
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-navy/45 backdrop-blur-[2px]"
              onClick={() => setMenuOpen(false)}
            />
            <aside role="dialog" aria-modal="true" aria-label="Navigation" className="relative h-dvh w-[min(86vw,280px)] overscroll-contain border-r border-white/10 bg-[#0c2348] px-3 pb-3 pt-5 shadow-2xl">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
              {rail}
            </aside>
          </div>
        )}

        <main id="ultimate-main" className="ultimate-surface">{children}</main>
      </div>
    </div>
  );
}

function RailLink({ item, active, locked = false, onNavigate }: { item: NavItem; active: boolean; locked?: boolean; onNavigate: () => void }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-2.5 rounded-[11px] px-3 py-2 text-[13px] font-semibold transition-colors ${
        active ? "bg-sky/15 text-white" : "text-white/70 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      <Icon className={`h-[18px] w-[18px] flex-none ${active ? "text-sky" : "text-white/55"}`} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {locked ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white/65"><LockIcon className="h-2.5 w-2.5" />{item.requires === "drills" ? "Core" : "Max"}</span>
      ) : null}
      {item.chip && (
        <span className="rounded-full bg-brand/20 px-1.5 py-0.5 text-[9px] font-bold text-sky">{item.chip}</span>
      )}
    </Link>
  );
}

function canUse(item: NavItem, access: StudentAccess): boolean {
  if (item.requires === "drills") return access.entitlements.dailyDrillLimit !== null;
  if (item.requires === "planner") return access.entitlements.studyPlanner;
  if (item.requires === "live") return access.entitlements.liveGroupClasses;
  return true;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/ultimate/tests" && pathname.startsWith("/practice-test/")) return true;
  return href === "/ultimate" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function EditIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9Z" strokeLinejoin="round" />
    </svg>
  );
}

function CoursesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" strokeLinejoin="round" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20M8 7h8M8 10.5h6" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h2M14 14h2" strokeLinecap="round" />
    </svg>
  );
}

function VideoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="6" width="13" height="12" rx="2" />
      <path d="m16.5 10 4-2.5v9l-4-2.5" strokeLinejoin="round" />
    </svg>
  );
}

function QuestionBankIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="14" rx="2.5" />
      <path d="M8 20h8M12 18v2M8.5 9.2h7M8.5 12.8h4.5" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}
