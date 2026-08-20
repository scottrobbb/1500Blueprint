import Link from "next/link";
import { PlanBadge } from "./PlanBadge";
import type { PlanCode } from "@/lib/auth/plans";

export function AccessGate({ title, description, currentPlan, requiredPlan = "max" }: { title: string; description: string; currentPlan: PlanCode; requiredPlan?: "core" | "max" }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-[760px] place-items-center px-4 py-10 sm:px-7">
      <section className="w-full overflow-hidden rounded-[22px] border border-navy/10 bg-white text-center shadow-[0_24px_70px_-42px_rgba(11,42,91,0.6)]">
        <div className="bg-[linear-gradient(125deg,#0b2a5b,#174b91)] px-6 py-8 text-white sm:px-10">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-sky"><LockIcon /></span>
          <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky">{requiredPlan} feature</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.035em]">{title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/65">{description}</p>
        </div>
        <div className="px-6 py-7 sm:px-10">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-navy/45">Current access <PlanBadge plan={currentPlan} /></div>
          <Link href="/pricing" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-6 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">See upgrade options</Link>
        </div>
      </section>
    </div>
  );
}

export function SuspendedAccount() {
  return <AccessGate title="This account is suspended" description="Access has been paused. Contact support if you believe this is a mistake." currentPlan="free" requiredPlan="max" />;
}

function LockIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" /></svg>; }
