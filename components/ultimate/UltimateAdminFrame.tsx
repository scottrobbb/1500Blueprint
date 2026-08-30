import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldIcon } from "@/components/shell/icons";

export type UltimateAdminSection = "growth" | "courses" | "bank" | "reports" | "tests" | "sets" | "community" | "calls" | "students" | "staff" | "drills";

const sections: { key: UltimateAdminSection; label: string; href: string }[] = [
  { key: "growth", label: "Growth", href: "/ultimate/admin/growth" },
  { key: "courses", label: "Courses", href: "/ultimate/admin/courses" },
  { key: "bank", label: "Question Bank", href: "/ultimate/admin" },
  { key: "reports", label: "Reports", href: "/ultimate/admin/reports" },
  { key: "tests", label: "Practice Tests", href: "/ultimate/admin/tests" },
  { key: "sets", label: "Flashcards", href: "/ultimate/admin/sets" },
  { key: "community", label: "Community", href: "/ultimate/admin/community" },
  { key: "calls", label: "Weekly Calls", href: "/ultimate/admin/calls" },
  { key: "students", label: "Students", href: "/ultimate/admin/students" },
  { key: "staff", label: "Staff Roles", href: "/ultimate/admin/staff" },
  { key: "drills", label: "Drill Settings", href: "/ultimate/admin/drills" },
];

export function UltimateAdminFrame({
  active,
  email,
  children,
}: {
  active: UltimateAdminSection;
  email: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1220px] px-4 py-7 sm:px-7">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-brand-600">
            <ShieldIcon className="h-4 w-4" /> Scott-only workspace
          </div>
          <h1 className="mt-1 font-display text-[30px] font-extrabold tracking-[-0.03em] text-ink">Admin panel</h1>
          <p className="mt-1 text-sm text-navy/50">Author content, manage students, and control what is live.</p>
        </div>
        <span className="max-w-[260px] truncate rounded-full border border-navy/10 bg-white px-3 py-1.5 text-xs font-semibold text-navy/50" title={email}>
          {email}
        </span>
      </header>

      <nav aria-label="Admin sections" className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-navy/10 bg-white p-1.5 shadow-pop [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => {
          const selected = section.key === active;
          return (
            <Link
              key={section.key}
              href={section.href}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex min-h-10 flex-none items-center rounded-xl px-3.5 text-sm font-semibold transition-colors ${selected ? "bg-navy text-white" : "text-navy/55 hover:bg-haze hover:text-navy"}`}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      <section className="rounded-[18px] border border-navy/10 bg-white p-4 shadow-pop sm:p-6">{children}</section>
    </div>
  );
}
