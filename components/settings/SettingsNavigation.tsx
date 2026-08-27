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
        <current.Icon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-600" />
        <select
          id="settings-page"
          value={current.href}
          onChange={(event) => router.push(event.target.value)}
          className="min-h-12 w-full appearance-none rounded-xl border border-navy/15 bg-white py-2 pl-11 pr-10 text-sm font-bold text-navy shadow-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15"
        >
          {items.map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
        </select>
        <ChevronIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/45" />
      </div>

      <nav aria-label="Settings navigation" className="hidden space-y-1 lg:block">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active
                  ? "bg-navy text-white shadow-sm"
                  : "text-navy/62 hover:bg-navy/[0.055] hover:text-navy"
              }`}
            >
              <span
                className={`grid h-8 w-8 flex-none place-items-center rounded-lg ${
                  active
                    ? "bg-white/10 text-sky"
                    : "bg-navy/[0.055] text-navy/50 group-hover:text-brand-600"
                }`}
              >
                <item.Icon className="h-[18px] w-[18px]" />
              </span>
              <strong className="min-w-0 truncate text-[13px] font-extrabold">{item.label}</strong>
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
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6" strokeLinecap="round" />
    </svg>
  );
}

function PlanIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9h18M7 15h4" strokeLinecap="round" />
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
