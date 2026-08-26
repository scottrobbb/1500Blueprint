import type { PlanCode } from "@/lib/auth/plans";

const bgByPlan: Record<PlanCode, string> = {
  free: "border-navy/15 bg-haze text-navy/60",
  core: "border-brand/20 bg-ice text-brand-600",
  max: "border-gold/30 bg-[#fffaf0] text-[#70550b]",
};

export function PlanBadge({ plan, suspended = false, test = false }: { plan: PlanCode; suspended?: boolean; test?: boolean }) {
  if (suspended) {
    return <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700">Suspended</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${bgByPlan[plan]} px-2.5 py-1 text-[10px] font-semibold`}>
      {plan === "free" ? "Free" : plan === "core" ? "Core" : "Max"}{test ? <span className="opacity-70">· Test</span> : null}
    </span>
  );
}
