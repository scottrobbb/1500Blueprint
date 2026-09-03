"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Avatar } from "./Avatar";
import { SettingsIcon } from "./icons";

type Props = {
  name: string;
  initials: string;
  level: number;
  plan: string;
  avatarUrl: string | null;
  wide?: boolean;
  tone?: "light" | "dark";
  test?: boolean;
  billing?: boolean;
};

// The nav avatar opens account navigation and the sign-out action.
export function AccountMenu({ name, initials, level, plan, avatarUrl, wide = false, tone = "light", test = false, billing = false }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className={wide ? "relative min-w-0 flex-1" : "relative"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Account menu"
        className={wide
          ? `flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ${tone === "dark" ? "hover:bg-white/[0.07] focus-visible:outline-sky" : "hover:bg-navy/[0.045] focus-visible:outline-brand"}`
          : "inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"}
      >
        <Avatar src={avatarUrl} initials={initials} alt={name} className={wide ? `h-10 w-10 flex-none border-2 text-[13px] ${tone === "dark" ? "border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" : "border-white shadow-[0_0_0_1px_rgba(11,42,91,0.15)]"}` : "h-[34px] w-[34px] border-2 border-white text-[13px] shadow-[0_0_0_1px_rgba(11,42,91,0.15)]"} />
        {wide ? <><span className="min-w-0 flex-1"><strong className={`block truncate text-xs font-extrabold ${tone === "dark" ? "text-white/90" : "text-navy"}`}>{name}</strong><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white shadow-sm ${planBadgeBg(plan)}`}>{plan}{test ? " · Test" : ""}</span></span><ChevronIcon className={`h-4 w-4 flex-none transition-transform duration-200 motion-reduce:transition-none ${tone === "dark" ? "text-white/40" : "text-navy/35"} ${open ? "rotate-180" : ""}`} /></> : null}
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <>
          <button
            type="button"
            aria-label="Close account dialog"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 cursor-default bg-navy/30 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Your account"
            className="fixed left-1/2 top-1/2 z-[60] w-[min(calc(100vw-2rem),360px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[22px] border border-navy/12 bg-white shadow-[0_28px_80px_-28px_rgba(11,42,91,0.65)]"
          >
            <div className="relative flex items-center gap-4 border-b border-navy/10 px-5 py-5">
              <Avatar src={avatarUrl} initials={initials} alt={name} className="h-12 w-12 flex-none text-sm" />
              <div className="min-w-0 pr-9">
                <div className="truncate font-display text-lg font-extrabold text-navy">{name}</div>
                <div className="mt-1 text-sm font-medium text-navy/50">
                  Level {level} · {plan}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close account dialog" className="absolute right-3 top-3 grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-navy/40 transition-colors duration-200 hover:bg-navy/5 hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><CloseIcon className="h-5 w-5" /></button>
            </div>

            <Link
              href="/settings/account"
              onClick={() => setOpen(false)}
              className="flex min-h-12 w-full items-center gap-3 border-t border-navy/10 px-5 py-3 text-left text-sm font-semibold text-navy/70 transition-colors duration-200 hover:bg-navy/5 hover:text-navy focus-visible:bg-navy/5 focus-visible:outline-none"
            >
              <SettingsIcon className="h-4 w-4" /> Settings
            </Link>

            {billing ? (
              <form action="/api/billing/portal" method="post" className="border-t border-navy/10">
                <input type="hidden" name="returnTo" value={pathname} />
                <button
                  type="submit"
                  className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-navy/70 transition-colors duration-200 hover:bg-navy/5 hover:text-navy focus-visible:bg-navy/5 focus-visible:outline-none"
                >
                  <BillingIcon className="h-4 w-4" /> Manage billing
                </button>
              </form>
            ) : null}

            <form action="/api/auth/logout" method="post" className="border-t border-navy/10">
              <button
                type="submit"
                className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm font-bold text-danger-600 transition-colors duration-200 hover:bg-danger-bg focus-visible:bg-danger-bg focus-visible:outline-none"
              >
                <SignOutIcon className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </>,
        document.body,
      ) : null}

    </div>
  );
}

function planBadgeBg(plan: string): string {
  const normalized = plan.toLowerCase();
  if (normalized === "core") return "bg-sky";
  if (normalized === "max") return "bg-gold";
  return "bg-shell-500";
}

function ChevronIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function BillingIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 9h18M7 15h4" strokeLinecap="round" /></svg>; }
function SignOutIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CloseIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>; }
