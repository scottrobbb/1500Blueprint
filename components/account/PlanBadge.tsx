import type { PlanCode } from "@/lib/auth/plans";

const styles: Record<PlanCode, string> = {
  free: "border-navy/15 bg-navy/[0.05] text-navy/60",
  core: "border-brand/25 bg-ice text-brand-700",
  max: "border-gold/35 bg-[#fff7db] text-[#7b5900]",
};

export function PlanBadge({ plan, suspended = false, test = false }: { plan: PlanCode; suspended?: boolean; test?: boolean }) {
  if (suspended) {
    return <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-red-700">Suspended</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ${styles[plan]}`}>
      {plan}{test ? <span className="opacity-55">· Test</span> : null}
    </span>
  );
}
