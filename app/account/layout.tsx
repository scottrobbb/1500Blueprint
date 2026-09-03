import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: {
    default: "Student account | 1500 Blueprint",
    template: "%s | 1500 Blueprint",
  },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-ice px-4 py-6 sm:px-6 lg:grid-cols-[minmax(320px,0.78fr)_minmax(520px,1.22fr)] lg:p-0">
      <section className="relative hidden overflow-hidden bg-navy p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div aria-hidden className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full border-[74px] border-sky/[0.06]" />
        <div aria-hidden className="absolute -bottom-48 -left-40 h-[460px] w-[460px] rounded-full border-[64px] border-brand/[0.08]" />
        <Link href="/" className="relative inline-flex w-fit items-center">
          <Logo className="[&_.text-navy]:text-white" />
        </Link>
        <div className="relative max-w-lg">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-sky">One account. Every score.</p>
          <h2 className="mt-4 font-display text-[46px] font-extrabold leading-[1.02] tracking-[-0.045em] xl:text-[58px]">
            Your SAT progress stays with you.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-white/62">
            Courses, drills, full-length tests, and your study plan stay connected across every session.
          </p>
          <div className="mt-8 grid gap-3 text-sm font-semibold text-white/72">
            <Benefit>Pick up exactly where you stopped</Benefit>
            <Benefit>Keep scores and practice history together</Benefit>
            <Benefit>Manage your plan from one account</Benefit>
          </div>
        </div>
        <p className="relative text-xs text-white/35">1500 Blueprint by Scott Robinson</p>
      </section>

      <section className="flex min-h-[calc(100dvh-3rem)] items-center justify-center lg:min-h-dvh">
        <div className="w-full max-w-[460px]">
          <Link href="/" className="mb-6 flex justify-center lg:hidden">
            <Logo />
          </Link>
          <div className="rounded-[22px] border border-navy/10 bg-white p-6 shadow-[0_24px_70px_-38px_rgba(11,42,91,0.45)] sm:p-9">
            {children}
          </div>
          <p className="mt-5 text-center text-xs leading-5 text-navy/40">
            Current members can continue using the existing{" "}
            <Link href="/login" className="font-semibold text-navy/65 hover:text-brand-600">email-link sign in</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand/15 text-sky">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m4 10 3.5 3.5L16 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {children}
    </span>
  );
}
