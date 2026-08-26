import Link from "next/link";
import { PlanBadge } from "./PlanBadge";
import { LockIcon } from "./UpgradePrompt";
import type { PlanCode } from "@/lib/auth/plans";

export function AccessGate({ title, description, currentPlan, requiredPlan = "max", upgrade = true }: { title: string; description: string; currentPlan: PlanCode; requiredPlan?: "core" | "max"; upgrade?: boolean }) {
  const features = requiredPlan === "core"
    ? ["Daily skill drills", "Challenge questions", "More full tests"]
    : ["Every course", "Personal study planner", "Weekly live calls"];
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-3.5rem)] w-full max-w-[680px] place-items-center px-4 py-10 sm:px-7">
      <section className="w-full rounded-xl border border-navy/12 bg-white p-7 text-left sm:p-10">
        <span className="grid h-10 w-10 place-items-center rounded-lg border border-navy/10 bg-haze text-navy/60"><LockIcon className="h-5 w-5" /></span>
        <p className="mt-5 text-xs font-semibold text-brand-600">{requiredPlan === "core" ? "Core" : "Max"} plan</p>
        <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.035em] text-ink">{title}</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-navy/58">{description}</p>
        <div className="mt-6 flex items-center gap-2 text-xs font-medium text-navy/48">Current plan <PlanBadge plan={currentPlan} /></div>
        {upgrade ? <><ul className="mt-5 grid gap-2 sm:grid-cols-3">{features.map((feature) => <li key={feature} className="text-xs font-medium text-navy/62">✓ {feature}</li>)}</ul><Link href="/pricing" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-navy px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">See {requiredPlan === "core" ? "Core" : "Max"} plan</Link></> : null}
      </section>
    </div>
  );
}

export function SuspendedAccount() {
  return <AccessGate title="This account is suspended" description="Access has been paused. Contact support if you believe this is a mistake." currentPlan="free" requiredPlan="max" upgrade={false} />;
}
