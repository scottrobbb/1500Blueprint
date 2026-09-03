"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const items = [
  {
    href: "/settings/account",
    label: "Account",
    Icon: AccountIcon,
  },
  {
    href: "/settings/subscription",
    label: "Subscription",
    Icon: PlanIcon,
  },
  {
    href: "/settings/appearance",
    label: "Appearance",
    Icon: AppearanceIcon,
  },
  {
    href: "/settings/progress",
    label: "Progress",
    Icon: ProgressIcon,
  },
  {
    href: "/settings/study-preferences",
    label: "Study preferences",
    Icon: StudyIcon,
  },
  {
    href: "/settings/security",
    label: "Security",
    Icon: SecurityIcon,
  },
];

export function SettingsNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const current = items.find((item) => item.href === pathname) ?? items[0];

  return (
    <div className="w-full">
      <label className="sr-only" htmlFor="settings-page">
        Settings page
      </label>
      <div className="relative lg:hidden">
        <current.Icon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-navy/55" />
        <select
          id="settings-page"
          value={current.href}
          onChange={(event) => router.push(event.target.value)}
          className="min-h-11 w-full appearance-none rounded-xl border-2 border-navy/10 bg-white py-2 pl-10 pr-10 text-sm font-bold text-navy outline-none transition-colors focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
        >
          {items.map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
        </select>
        <ChevronIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/45" />
      </div>

      <nav aria-label="Settings navigation" className="hidden space-y-1 lg:block">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-bold transition-colors ${
                active
                  ? "bg-navy/[0.075] text-navy"
                  : "text-navy/55 hover:bg-navy/[0.045] hover:text-navy"
              }`}
            >
              <item.Icon className={`h-5 w-5 flex-none ${active ? "text-navy/65" : "text-navy/40 group-hover:text-navy/60"}`} />
              <span className="min-w-0 truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

type IconProps = { className?: string };

function AccountIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6" />
    </svg>
  );
}

function PlanIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9h18M7 15h4" />
    </svg>
  );
}

function AppearanceIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ProgressIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 18V9m7 9V5m7 13v-6" />
      <path d="M3.5 20h17" />
    </svg>
  );
}

function StudyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
    </svg>
  );
}

function SecurityIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.6 2.7 8.2 7 10 4.3-1.8 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ChevronIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
