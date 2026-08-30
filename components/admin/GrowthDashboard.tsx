import type { ReactNode } from "react";
import type { StudentRow } from "@/lib/gamification/state";
import { computeGrowthStats, type GrowthWeekBucket } from "@/lib/gamification/growth";
import { PlanBadge } from "@/components/account/PlanBadge";
import { label } from "@/components/drills/shared/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BAR_HEIGHT_PX = 128;

// Server-rendered only (no "use client") -- every date/format call below runs
// once on the server, so there's no hydration-mismatch risk from using the
// real clock or locale-aware formatting.
export function GrowthDashboard({ students }: { students: StudentRow[] }) {
  const stats = computeGrowthStats(students);
  const weekDelta = stats.newLast7Days - stats.newPrevious7Days;
  const maxWeekTotal = Math.max(1, ...stats.weeks.map((w) => w.free + w.paid));
  const recent = students
    .filter((s) => !s.isTestAccount && s.joined)
    .slice()
    .sort((a, b) => (b.joined ?? "").localeCompare(a.joined ?? ""))
    .slice(0, 12);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">Growth</h1>
        <p className="mt-1 text-sm text-navy/55">
          New accounts over time, and how many are currently free vs paid.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total students" value={fmt(stats.totalStudents)} />
        <StatCard label="Free" value={fmt(stats.free)} sub={pct(stats.free, stats.totalStudents)} />
        <StatCard label="Core" value={fmt(stats.core)} sub={pct(stats.core, stats.totalStudents)} />
        <StatCard label="Max" value={fmt(stats.max)} sub={pct(stats.max, stats.totalStudents)} accent />
        <StatCard label="Paid conversion" value={`${Math.round(stats.conversionRate * 100)}%`} sub={`${fmt(stats.paid)} paid`} />
        <StatCard label="New this week" value={fmt(stats.newLast7Days)} sub={<DeltaBadge delta={weekDelta} />} />
      </div>

      <section className="rounded-card border border-navy/15 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-extrabold text-navy">New accounts by week</h2>
            <p className="mt-0.5 text-xs text-navy/50">Last 12 weeks, split by each student&apos;s current plan.</p>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-semibold text-navy/55">
            <LegendItem swatch="bg-navy/15" label="Free" />
            <LegendItem swatch="bg-brand" label="Paid" />
          </div>
        </div>
        {maxWeekTotal <= 1 && stats.weeks.every((w) => w.free + w.paid === 0) ? (
          <p className="py-10 text-center text-sm text-navy/45">No signups in this window yet.</p>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto">
            {stats.weeks.map((week) => (
              <WeekBar key={week.weekStart} week={week} maxTotal={maxWeekTotal} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-card border border-navy/15 bg-white p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base font-extrabold text-navy">Newest students</h2>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-navy/45">No signups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-navy/10">
                  <th className={`${label} px-3 py-2 text-navy/45`}>Student</th>
                  <th className={`${label} px-3 py-2 text-navy/45`}>Plan</th>
                  <th className={`${label} px-3 py-2 text-navy/45`}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id} className="border-b border-navy/8 last:border-b-0">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-ink">{s.name}</div>
                      <div className="text-xs text-navy/50">{s.email}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <PlanBadge plan={s.plan} suspended={s.accountStatus === "suspended"} test={s.isTestAccount} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-navy/60">{fmtDate(s.joined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function WeekBar({ week, maxTotal }: { week: GrowthWeekBucket; maxTotal: number }) {
  const total = week.free + week.paid;
  const freePx = Math.round((week.free / maxTotal) * BAR_HEIGHT_PX);
  const paidPx = Math.round((week.paid / maxTotal) * BAR_HEIGHT_PX);
  return (
    <div className="flex min-w-[40px] flex-1 flex-col items-center gap-1.5">
      <span className="text-[10px] font-bold tabular-nums text-navy/45">{total || ""}</span>
      <div
        className="flex w-full flex-col-reverse justify-start overflow-hidden rounded-md bg-navy/[0.04]"
        style={{ height: `${BAR_HEIGHT_PX}px` }}
        title={`${week.free} free, ${week.paid} paid`}
      >
        <div className="w-full bg-navy/15" style={{ height: `${freePx}px` }} />
        <div className="w-full bg-brand" style={{ height: `${paidPx}px` }} />
      </div>
      <span className="whitespace-nowrap text-[9px] font-semibold text-navy/40">{weekLabel(week.weekStart)}</span>
    </div>
  );
}

function StatCard({ label: text, value, sub, accent }: { label: string; value: string; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-card border border-navy/12 bg-white px-4 py-3">
      <div className={`${label} text-navy/45`}>{text}</div>
      <div className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${accent ? "text-brand-600" : "text-navy"}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs font-semibold text-navy/45">{sub}</div> : null}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-navy/40">Same as last week</span>;
  const up = delta > 0;
  return (
    <span className={up ? "text-success-600" : "text-danger-600"}>
      {up ? "▲" : "▼"} {Math.abs(delta)} vs last week
    </span>
  );
}

function LegendItem({ swatch, label: text }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} />
      {text}
    </span>
  );
}

function fmt(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function weekLabel(weekStartIso: string): string {
  const [y, m, d] = weekStartIso.split("-");
  const mi = Number(m) - 1;
  if (!y || Number.isNaN(mi) || mi < 0 || mi > 11) return weekStartIso;
  return `${MONTHS[mi]} ${Number(d)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  if (!y || Number.isNaN(mi) || mi < 0 || mi > 11) return iso.slice(0, 10);
  return `${MONTHS[mi]} ${Number(d)}, ${y}`;
}
