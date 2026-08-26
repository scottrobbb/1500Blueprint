import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: {
    default: "Student account | 1500 SAT Blueprint",
    template: "%s | 1500 SAT Blueprint",
  },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-[#f4f5f6] px-4 py-6 sm:px-6 lg:grid-cols-[minmax(340px,0.78fr)_minmax(520px,1.22fr)] lg:p-0">
      <section className="hidden border-r border-white/10 bg-[#111923] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <Link href="/" className="inline-flex w-fit items-center">
          <Logo className="[&_.text-navy]:text-white" />
        </Link>
        <div className="max-w-lg">
          <p className="text-xs font-semibold text-sky">Your student account</p>
          <h2 className="mt-3 font-display text-[42px] font-semibold leading-[1.05] tracking-[-0.045em] xl:text-[50px]">
            Keep your SAT work in one place.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-white/58">
            Your lessons, practice answers, test scores, and study plan stay connected to this account.
          </p>
          <div className="mt-8 grid gap-3 text-sm font-medium text-white/68">
            <Benefit>Resume your last lesson</Benefit>
            <Benefit>Review every saved score</Benefit>
            <Benefit>Manage your plan and account</Benefit>
          </div>
        </div>
        <p className="text-xs text-white/35">1500 SAT Blueprint · Scott Robinson</p>
      </section>

      <section className="flex min-h-[calc(100dvh-3rem)] items-center justify-center lg:min-h-dvh">
        <div className="w-full max-w-[460px]">
          <Link href="/" className="mb-6 flex justify-center lg:hidden">
            <Logo />
          </Link>
          <div className="rounded-xl border border-navy/12 bg-white p-6 shadow-[0_1px_2px_rgba(19,35,59,0.05)] sm:p-9">
            {children}
          </div>
          <p className="mt-5 text-center text-xs leading-5 text-navy/40">
            Prefer an email link?{" "}
            <Link href="/login" className="font-semibold text-navy/65 hover:text-brand-600">Use email link sign in</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      <span className="grid h-5 w-5 flex-none place-items-center rounded-full border border-white/15 text-sky">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m4 10 3.5 3.5L16 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {children}
    </span>
  );
}
