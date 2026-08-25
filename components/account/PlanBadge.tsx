import type { PlanCode } from "@/lib/auth/plans";

const bgByPlan: Record<PlanCode, string> = {
  free: "bg-gold",
  core: "bg-sky",
  max: "bg-gold",
};

export function PlanBadge({ plan, suspended = false, test = false }: { plan: PlanCode; suspended?: boolean; test?: boolean }) {
  if (suspended) {
    return <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-red-700">Suspended</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${bgByPlan[plan]} px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white shadow-sm`}>
      {plan}{test ? <span className="opacity-80">· Test</span> : null}
    </span>
  );
}
