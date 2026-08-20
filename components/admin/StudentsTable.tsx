"use client";

import { useMemo, useState, type ReactNode } from "react";
import { drillTitle } from "@/lib/drills/registry";
import { label } from "@/components/drills/shared/ui";
import { FlameIcon } from "@/components/shell/icons";
import type { StudentRow } from "@/lib/gamification/state";
import { PlanBadge } from "@/components/account/PlanBadge";

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
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  if (!y || Number.isNaN(mi) || mi < 0 || mi > 11) return iso.slice(0, 10);
  return `${MONTHS[mi]} ${Number(d)}, ${y}`;
}
function fmtNum(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

type SortKey = "name" | "xp" | "streak" | "mastered" | "bestTest" | "lastActive";

export function StudentsTable({ students }: { students: StudentRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("xp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const summary = useMemo(() => {
    const totalXp = students.reduce((s, r) => s + r.xp, 0);
    const totalMastered = students.reduce((s, r) => s + r.totalMastered, 0);
    const avgLevel =
      students.length > 0
        ? Math.round(students.reduce((s, r) => s + r.level, 0) / students.length)
        : 0;
    return { count: students.length, totalXp, totalMastered, avgLevel };
  }, [students]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? students.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
      : students;

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
  }, [students, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "lastActive" ? "asc" : "desc");
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
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full max-w-xs rounded-card border border-navy/20 bg-white px-3.5 py-2 text-sm text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
        <span className="text-sm text-navy/50">
          {rows.length} {rows.length === 1 ? "student" : "students"}
          {query ? ` of ${students.length}` : ""}
        </span>
      </div>

      {students.length === 0 ? (
        <div className="rounded-card border border-dashed border-navy/20 bg-mist px-4 py-16 text-center text-sm text-navy/50">
          No students yet. Accounts appear here after their first login.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-navy/15 bg-white">
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-navy/10 bg-mist">
                <SortTh label="Student" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} className="w-[26%]" />
                <Th>Plan</Th>
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
                    <div className="flex flex-wrap gap-1.5"><PlanBadge plan={s.plan} suspended={s.accountStatus === "suspended"} test={s.isTestAccount} />{s.accountStatus === "archived" ? <span className="inline-flex rounded-full border border-navy/15 bg-navy/[0.04] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-navy/45">Archived</span> : null}</div>
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
                      <span className="text-navy/35">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-navy/60">{fmtDate(s.lastActive)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
