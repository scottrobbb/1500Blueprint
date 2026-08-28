"use client";

import { useMemo, useState, type ReactNode } from "react";
import { drillTitle } from "@/lib/drills/registry";
import { label } from "@/components/drills/shared/ui";
import { FlameIcon } from "@/components/shell/icons";
import type { StudentRow } from "@/lib/gamification/state";
import { PlanBadge } from "@/components/account/PlanBadge";
import { effectivePlan } from "@/lib/auth/plans";

// Drills shown in the per-student mastery breakdown (must match ROSTER_DRILLS
// in lib/gamification/state.ts).
const ROSTER_DRILLS = ["grammar", "reading", "targeted-math", "vocab"] as const;
const SHORT: Record<string, string> = {
  grammar: "Gr",
  reading: "Rd",
  "targeted-math": "Ma",
  vocab: "Vo",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Deterministic formatting (no locale / Date.now) so server and client markup
// match — avoids hydration mismatches in the table.
function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  if (!y || Number.isNaN(mi) || mi < 0 || mi > 11) return iso.slice(0, 10);
  return `${MONTHS[mi]} ${Number(d)}, ${y}`;
}
function fmtNum(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

type SortKey = "name" | "xp" | "streak" | "mastered" | "bestTest" | "lastActive";
type StudentView = "all" | "complimentary" | "suspended";

export function StudentsTable({ students }: { students: StudentRow[] }) {
  const [studentRows, setStudentRows] = useState(students);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<StudentView>("all");
  const [sortKey, setSortKey] = useState<SortKey>("xp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const summary = useMemo(() => {
    const totalXp = studentRows.reduce((s, r) => s + r.xp, 0);
    const totalMastered = studentRows.reduce((s, r) => s + r.totalMastered, 0);
    const avgLevel =
      studentRows.length > 0
        ? Math.round(studentRows.reduce((s, r) => s + r.level, 0) / studentRows.length)
        : 0;
    const complimentary = studentRows.filter((student) => student.isComplimentary).length;
    const suspended = studentRows.filter(
      (student) => student.isComplimentary && student.accountStatus === "suspended",
    ).length;
    return { count: studentRows.length, totalXp, totalMastered, avgLevel, complimentary, suspended };
  }, [studentRows]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inView = studentRows.filter((student) => {
      if (view === "complimentary") return student.isComplimentary;
      if (view === "suspended") return student.isComplimentary && student.accountStatus === "suspended";
      return true;
    });
    const filtered = q
      ? inView.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
      : inView;

    const dir = sortDir === "asc" ? 1 : -1;
    const get = (s: StudentRow): string | number => {
      switch (sortKey) {
        case "name":
          return s.name.toLowerCase();
        case "streak":
          return s.streak;
        case "mastered":
          return s.totalMastered;
        case "bestTest":
          return s.bestTest ?? -1;
        case "lastActive":
          return s.lastActive ?? "";
        default:
          return s.xp;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [studentRows, query, view, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "lastActive" ? "asc" : "desc");
    }
  }

  async function changeComplimentaryAccess(student: StudentRow) {
    const nextStatus = student.accountStatus === "suspended" ? "active" : "suspended";
    const verb = nextStatus === "suspended" ? "Suspend" : "Reactivate";
    const detail = nextStatus === "suspended"
      ? "Their saved progress will remain intact, but complimentary access will stop immediately."
      : "Their complimentary access will be restored immediately.";
    if (!window.confirm(`${verb} ${student.email}?\n\n${detail}`)) return;

    setPendingId(student.id);
    setNotice(null);
    try {
      const response = await fetch(`/admin/api/students/${encodeURIComponent(student.id)}/access`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "The access change could not be saved.");

      setStudentRows((current) => current.map((row) => {
        if (row.id !== student.id) return row;
        const restoredPlan = effectivePlan(row.grantPlan, null, row.legacyPlan);
        return {
          ...row,
          accountStatus: nextStatus,
          plan: nextStatus === "active" ? restoredPlan : "free",
          accessSource: nextStatus === "active" ? (row.grantPlan ? "grant" : "legacy") : "free",
        };
      }));
      setNotice({
        tone: "success",
        text: `${student.name}'s complimentary access is now ${nextStatus}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "The access change could not be saved.",
      });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">Students</h1>
        <p className="mt-1 text-sm text-navy/55">
          Everyone with an account, their progress, and how active they are.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Students" value={fmtNum(summary.count)} />
        <StatCard label="Total XP" value={fmtNum(summary.totalXp)} accent />
        <StatCard label="Drills mastered" value={fmtNum(summary.totalMastered)} />
        <StatCard label="Avg level" value={String(summary.avgLevel)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-wrap gap-2" role="group" aria-label="Student access filters">
          <ViewButton active={view === "all"} onClick={() => setView("all")}>
            All students <CountBadge>{summary.count}</CountBadge>
          </ViewButton>
          <ViewButton active={view === "complimentary"} onClick={() => setView("complimentary")}>
            Complimentary <CountBadge>{summary.complimentary}</CountBadge>
          </ViewButton>
          <ViewButton active={view === "suspended"} onClick={() => setView("suspended")}>
            Suspended <CountBadge>{summary.suspended}</CountBadge>
          </ViewButton>
        </div>
        <input
          type="search"
          aria-label="Search students by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full max-w-xs rounded-card border border-navy/20 bg-white px-3.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
        <span className="text-sm text-navy/50">
          {rows.length} {rows.length === 1 ? "student" : "students"}
          {query || view !== "all" ? ` of ${studentRows.length}` : ""}
        </span>
      </div>

      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className={`mb-3 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${
            notice.tone === "success"
              ? "border-success/25 bg-success-bg text-success-600"
              : "border-danger/25 bg-danger-bg text-danger-600"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {studentRows.length === 0 ? (
        <div className="rounded-card border border-dashed border-navy/20 bg-mist px-4 py-16 text-center text-sm text-navy/50">
          No students yet. Accounts appear here after their first login.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-navy/15 bg-white">
          <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-navy/10 bg-mist">
                <SortTh label="Student" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} className="w-[26%]" />
                <Th className="w-[22%]">Access</Th>
                <SortTh label="Level / XP" active={sortKey === "xp"} dir={sortDir} onClick={() => toggleSort("xp")} />
                <SortTh label="Streak" active={sortKey === "streak"} dir={sortDir} onClick={() => toggleSort("streak")} />
                <SortTh label="Drill mastery" active={sortKey === "mastered"} dir={sortDir} onClick={() => toggleSort("mastered")} className="w-[22%]" />
                <SortTh label="Best test" active={sortKey === "bestTest"} dir={sortDir} onClick={() => toggleSort("bestTest")} />
                <SortTh label="Last active" active={sortKey === "lastActive"} dir={sortDir} onClick={() => toggleSort("lastActive")} />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.email} className="border-b border-navy/8 last:border-b-0 hover:bg-brand/5">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#3fa9f5,#0b2a5b)] font-display text-xs font-bold text-white">
                        {s.initials}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{s.name}</div>
                        <div className="truncate text-xs text-navy/50">{s.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <PlanBadge
                        plan={s.plan}
                        suspended={s.accountStatus === "suspended"}
                        test={s.isTestAccount}
                      />
                      {s.isComplimentary ? (
                        <span className="inline-flex rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-brand-600">
                          Complimentary
                        </span>
                      ) : null}
                      {s.accountStatus === "archived" ? (
                        <span className="inline-flex rounded-full border border-navy/15 bg-navy/[0.04] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-navy/45">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <AccessDetails
                      student={s}
                      pending={pendingId === s.id}
                      onChangeAccess={() => changeComplimentaryAccess(s)}
                    />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div className="font-semibold text-navy">Lvl {s.level}</div>
                    <div className="text-xs text-navy/50">{fmtNum(s.xp)} XP</div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-flag">
                      <FlameIcon className="h-4 w-4" />
                      {s.streak}
                    </span>
                  </Td>
                  <Td>
                    <div className="font-semibold text-navy">
                      {s.totalMastered} <span className="font-normal text-navy/45">mastered</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ROSTER_DRILLS.map((slug) => {
                        const stat = s.perDrill[slug] ?? { attempted: 0, mastered: 0 };
                        const touched = stat.attempted > 0;
                        return (
                          <span
                            key={slug}
                            title={`${drillTitle(slug)}: ${stat.mastered} mastered / ${stat.attempted} attempted`}
                            className={`inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                              touched ? "bg-navy/5 text-navy/70" : "bg-navy/[0.03] text-navy/30"
                            }`}
                          >
                            {SHORT[slug]} {stat.mastered}/{stat.attempted}
                          </span>
                        );
                      })}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {s.bestTest != null ? (
                      <span className="font-semibold text-success-600">{s.bestTest}</span>
                    ) : (
                      <span className="text-navy/35">-</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-navy/60">{fmtDate(s.lastActive)}</Td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-navy/50">
                    {view === "complimentary"
                      ? "No complimentary students match this search."
                      : view === "suspended"
                        ? "No suspended complimentary students match this search."
                        : "No students match this search."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AccessDetails({
  student,
  pending,
  onChangeAccess,
}: {
  student: StudentRow;
  pending: boolean;
  onChangeAccess: () => void;
}) {
  const source = student.isComplimentary ? "Complimentary access"
    : student.accessSource === "subscription" ? "Stripe subscription"
    : student.accessSource === "grant" ? `${student.grantSource ?? "Admin"} grant`
    : student.accessSource === "legacy" ? "Legacy account plan"
    : "Free plan";
  const subscriptionStatus = student.subscriptionStatus?.replaceAll("_", " ");

  return (
    <div className="mt-1.5 space-y-0.5 text-[10px] leading-4 text-navy/50">
      <p className="font-bold capitalize text-navy/65">{source}</p>
      {subscriptionStatus ? (
        <p>
          Subscription: <span className="font-semibold capitalize">{subscriptionStatus}</span>
          {student.subscriptionPlan ? ` · ${student.subscriptionPlan.toUpperCase()}` : ""}
        </p>
      ) : null}
      {student.subscriptionPeriodStart || student.subscriptionPeriodEnd ? (
        <p>
          Period {fmtDate(student.subscriptionPeriodStart)}–{fmtDate(student.subscriptionPeriodEnd)}
          {student.subscriptionPeriodEnd
            ? student.cancellationScheduledAt
              ? ` · cancels ${fmtDate(student.cancellationScheduledAt)}`
              : ` · renews ${fmtDate(student.subscriptionPeriodEnd)}`
            : ""}
        </p>
      ) : null}
      {student.pendingPlan ? (
        <p className="font-semibold text-[#8a6500]">
          Pending {student.pendingPlan.toUpperCase()}{student.pendingCadence ? ` · ${student.pendingCadence === "three_month" ? "3 months" : "monthly"}` : ""}{student.pendingChangeEffectiveAt ? ` · ${fmtDate(student.pendingChangeEffectiveAt)}` : ""}
        </p>
      ) : null}
      {student.grantPlan ? (
        <p>
          Grant: {student.grantPlan.toUpperCase()}{student.grantExpiresAt ? ` · expires ${fmtDate(student.grantExpiresAt)}` : " · no expiry"}
        </p>
      ) : null}
      {student.isComplimentary && student.accountStatus !== "archived" ? (
        <button
          type="button"
          disabled={pending}
          onClick={onChangeAccess}
          className={`mt-2 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-xs font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-55 ${
            student.accountStatus === "suspended"
              ? "border-success/30 bg-success-bg text-success-600 hover:bg-success/15 focus-visible:outline-success"
              : "border-danger/25 bg-danger-bg text-danger-600 hover:bg-danger/10 focus-visible:outline-danger"
          }`}
        >
          {pending
            ? "Saving…"
            : student.accountStatus === "suspended"
              ? "Reactivate access"
              : "Suspend access"}
        </button>
      ) : null}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active
          ? "border-navy bg-navy text-white"
          : "border-navy/15 bg-white text-navy/65 hover:border-navy/30 hover:bg-mist"
      }`}
    >
      {children}
    </button>
  );
}

function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-current/10 px-2 py-0.5 text-[11px] tabular-nums">
      {children}
    </span>
  );
}

function StatCard({ label: text, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card border border-navy/12 bg-white px-4 py-3">
      <div className={`${label} text-navy/45`}>{text}</div>
      <div className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${accent ? "text-brand-600" : "text-navy"}`}>
        {value}
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-navy/50 ${className}`}>
      {children}
    </th>
  );
}

function SortTh({
  label: text,
  active,
  dir,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2.5 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
          active ? "text-navy" : "text-navy/50 hover:text-navy/80"
        }`}
      >
        {text}
        <span className={`text-[9px] leading-none ${active ? "opacity-100" : "opacity-30"}`}>
          {active ? (dir === "asc" ? "▲" : "▼") : "▼"}
        </span>
      </button>
    </th>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
}
