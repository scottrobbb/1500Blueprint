import Link from "next/link";
import type { PlanCode } from "@/lib/auth/plans";

type PaidPlan = Exclude<PlanCode, "free">;

export function UpgradePrompt({
  currentPlan,
  requiredPlan,
  title,
  description,
  features,
  className = "",
}: {
  currentPlan: PlanCode;
  requiredPlan: PaidPlan;
  title: string;
  description: string;
  features: string[];
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-[18px] border border-brand/20 bg-white shadow-pop ${className}`} aria-label={`${requiredPlan} upgrade`}>
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-[#fff5cf] text-[#8a6500]">
          <LockIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Included with {planName(requiredPlan)}</p>
            <span className="rounded-full bg-haze px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-navy/45">You have {planName(currentPlan)}</span>
          </div>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-0.02em] text-navy">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-navy/50">{description}</p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2" aria-label="Included features">
            {features.map((feature) => <li key={feature} className="inline-flex items-center gap-1.5 text-xs font-bold text-navy/60"><CheckIcon className="h-3.5 w-3.5 text-brand-600" />{feature}</li>)}
          </ul>
        </div>
        <Link href="/pricing" className="inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-xl bg-navy px-5 text-sm font-extrabold text-white transition-[background-color,transform] hover:bg-brand-600 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transform-none">
          Compare plans <ArrowIcon className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export function LockedBadge({ plan, dark = false }: { plan: PaidPlan; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] ${dark ? "border border-white/15 bg-black/20 text-white" : "bg-[#fff4cc] text-[#765800]"}`}>
      <LockIcon className="h-3 w-3" /> {planName(plan)}
    </span>
  );
}

export function LockedAction({ plan, label }: { plan: PaidPlan; label: string }) {
  return (
    <Link href="/pricing" className="flex min-h-11 items-center justify-between rounded-xl border border-brand/20 bg-ice/70 px-4 text-sm font-extrabold text-navy transition-colors hover:border-brand/40 hover:bg-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      <span className="inline-flex items-center gap-2"><LockIcon className="h-4 w-4 text-[#8a6500]" />{label}</span>
      <span className="flex-none text-xs text-brand-700">{planName(plan)} →</span>
    </Link>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" /></svg>;
}

function planName(plan: PlanCode): string {
  return plan === "free" ? "Free" : plan === "core" ? "Core" : "Max";
}

function CheckIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
