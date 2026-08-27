import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { NavStats } from "@/lib/gamification";
import { LayersIcon } from "@/components/flashcards/icons";
import { CommunityIcon } from "@/components/community/icons";
import { AccountMenu } from "./AccountMenu";
import { NotificationBell } from "./NotificationBell";
import { DrillsIcon, FlameIcon, HistoryIcon, ShieldIcon, TestsIcon } from "./icons";

type TabKey = "drills" | "tests" | "history" | "flashcards" | "community";

// Sticky translucent chrome shared across the signed-in surfaces. The primary
// destinations are one lightweight, borderless tab group (active = soft pill);
// streak/XP and the admin entry are compact so they never crowd the tabs.
const TABS: { key: TabKey; label: string; href: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { key: "drills", label: "Drills", href: "/drills", Icon: DrillsIcon },
  { key: "tests", label: "Tests", href: "/practice-test", Icon: TestsIcon },
  { key: "community", label: "Community", href: "/community", Icon: CommunityIcon },
  { key: "flashcards", label: "Flashcards", href: "/flashcards", Icon: LayersIcon },
  { key: "history", label: "History", href: "/history", Icon: HistoryIcon },
];

export function AppNav({ activePage, stats }: { activePage: TabKey | "settings"; stats: NavStats }) {
  return (
    <header className="sticky top-0 z-40 border-b border-navy/12 bg-white/[0.88] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1120px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6">
        <Link href="/drills" aria-label="1500 SAT Blueprint home" className="inline-flex flex-none items-center">
          <span className="sm:hidden">
            <Logo withWordmark={false} />
          </span>
          <span className="hidden sm:inline-flex">
            <Logo />
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-1 [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map(({ key, label, href, Icon }) => {
            const active = activePage === key;
            return (
              <Link
                key={key}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={`inline-flex flex-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${
                  active ? "bg-navy/[0.07] text-navy" : "text-navy/55 hover:bg-navy/[0.04] hover:text-navy"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-none items-center gap-2 sm:gap-3.5">
          <div className="hidden items-center gap-3.5 sm:flex">
            <span className="inline-flex items-center gap-1 text-sm font-bold text-flag" title="Day streak">
              <FlameIcon className="h-[18px] w-[18px] animate-flicker" />
              {stats.streak}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-navy" title={`Level ${stats.level}`}>
              <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand font-display text-[10px] leading-none text-white">
                {stats.level}
              </span>
              {stats.xp.toLocaleString()}
              <span className="font-semibold text-navy/45">XP</span>
            </span>
          </div>

          {stats.isAdmin && (
            <Link
              href="/admin"
              aria-label="Admin panel"
              title="Admin panel"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-flag transition-colors hover:bg-[#fff7e6]"
            >
              <ShieldIcon className="h-[18px] w-[18px]" />
            </Link>
          )}

          <NotificationBell />

          <AccountMenu
            name={stats.name}
            initials={stats.initials}
            level={stats.level}
            plan={stats.plan}
            avatarUrl={stats.avatarUrl}
          />
        </div>
      </div>
    </header>
  );
}
