"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffRoleAssignment } from "@/lib/auth/staff";
import type { ExplanationEditorStats } from "@/lib/explanations/queries";

export function StaffRoleManager({
  initialAssignments,
  editorStats,
}: {
  initialAssignments: StaffRoleAssignment[];
  editorStats: ExplanationEditorStats[];
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [email, setEmail] = useState("");
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalCompleted = editorStats.reduce((sum, editor) => sum + editor.completedTotal, 0);
  const completedLast7Days = editorStats.reduce((sum, editor) => sum + editor.completedLast7Days, 0);
  const completedToday = editorStats.reduce((sum, editor) => sum + editor.completedToday, 0);

  async function grant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    setBusyEmail(normalized);
    setError(null);
    const response = await fetch("/api/admin/staff/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: normalized, role: "explanation_editor" }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) setError(body?.error ?? "The role could not be granted.");
    else {
      setEmail("");
      setAssignments((current) => current.some((item) => item.email === normalized) ? current : [{ email: normalized, name: null, role: "explanation_editor", grantedBy: "", createdAt: new Date().toISOString() }, ...current]);
      router.refresh();
    }
    setBusyEmail(null);
  }

  async function revoke(assignment: StaffRoleAssignment) {
    if (!window.confirm(`Remove explanation access for ${assignment.email}?`)) return;
    setBusyEmail(assignment.email);
    setError(null);
    const response = await fetch("/api/admin/staff/roles", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: assignment.email, role: assignment.role }),
    });
    if (response.ok) setAssignments((current) => current.filter((item) => item.email !== assignment.email || item.role !== assignment.role));
    else setError("The role could not be removed.");
    setBusyEmail(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Scoped editorial access</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-navy">Explanation team</h2>
          <p className="mt-2 text-sm leading-6 text-navy/55">Editors can complete unanswered Easy, Medium, and Hard questions with explanations of at least 15 words. Challenge questions stay out of their queue, and completed explanations cannot be overwritten from the worker panel.</p>
        </div>
        <Link href="/manager" className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-navy px-4 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Open manager workspace →</Link>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-navy/10" aria-labelledby="editor-performance">
        <div className="border-b border-navy/10 bg-haze/55 px-4 py-4 sm:px-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-600">Contribution ledger</p>
          <h3 id="editor-performance" className="mt-1 font-display text-xl font-extrabold text-navy">Completed explanations</h3>
          <p className="mt-1 text-xs leading-5 text-navy/45">Each eligible question is credited once to the editor who first completed it. Repeated saves do not increase the count.</p>
        </div>
        <div className="grid border-b border-navy/10 bg-white sm:grid-cols-3 sm:divide-x sm:divide-navy/10">
          <Metric label="All time" value={totalCompleted} />
          <Metric label="Last 7 days" value={completedLast7Days} />
          <Metric label="Today" value={completedToday} />
        </div>
        <div className="overflow-x-auto bg-white">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[minmax(220px,1fr)_100px_100px_100px_170px] bg-haze px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.13em] text-navy/40">
              <span>Editor</span><span className="text-right">All time</span><span className="text-right">7 days</span><span className="text-right">Today</span><span className="text-right">Last completed</span>
            </div>
            {editorStats.length ? editorStats.map((editor) => (
              <div key={editor.email} className="grid grid-cols-[minmax(220px,1fr)_100px_100px_100px_170px] items-center border-t border-navy/10 px-4 py-3.5 text-sm">
                <div className="min-w-0"><div className="flex items-center gap-2"><strong className="truncate text-navy">{editor.name || editor.email}</strong><span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${editor.currentStaff ? "bg-success-bg text-success-600" : "bg-haze text-navy/40"}`}>{editor.currentStaff ? "Active" : "Former"}</span></div>{editor.name ? <span className="mt-0.5 block truncate text-xs text-navy/40">{editor.email}</span> : null}</div>
                <strong className="text-right font-display text-base tabular-nums text-navy">{editor.completedTotal.toLocaleString()}</strong>
                <span className="text-right tabular-nums text-navy/55">{editor.completedLast7Days.toLocaleString()}</span>
                <span className="text-right tabular-nums text-navy/55">{editor.completedToday.toLocaleString()}</span>
                <span className="text-right text-xs text-navy/45">{formatLastCompleted(editor.lastCompletedAt)}</span>
              </div>
            )) : <p className="px-5 py-9 text-center text-sm text-navy/45">No eligible explanations have been completed yet.</p>}
          </div>
        </div>
      </section>

      <section className="mt-7" aria-labelledby="access-management">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-600">Access management</p><h3 id="access-management" className="mt-1 font-display text-xl font-extrabold text-navy">Explanation editors</h3></div>
        <form onSubmit={grant} className="mt-4 flex flex-col gap-2 rounded-2xl border border-brand/20 bg-ice/45 p-4 sm:flex-row">
          <label htmlFor="staff-email" className="sr-only">Blueprint account email</label>
          <input id="staff-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="editor@example.com" className="min-h-11 min-w-0 flex-1 rounded-xl border border-navy/15 bg-white px-3 text-base text-navy outline-none placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm" />
          <button type="submit" disabled={Boolean(busyEmail)} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60">{busyEmail ? "Granting…" : "Grant explanation access"}</button>
        </form>
        {error ? <p role="alert" className="mt-3 rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-600">{error}</p> : null}

        <div className="mt-4 overflow-hidden rounded-2xl border border-navy/10">
          <div className="hidden grid-cols-[minmax(0,1fr)_190px_140px] bg-haze px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.13em] text-navy/40 sm:grid"><span>Team member</span><span>Access</span><span className="text-right">Action</span></div>
          {assignments.length ? assignments.map((assignment) => (
            <div key={`${assignment.email}-${assignment.role}`} className="grid gap-3 border-t border-navy/10 px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_190px_140px] sm:items-center">
              <div className="min-w-0"><strong className="block truncate text-sm text-navy">{assignment.name || assignment.email}</strong>{assignment.name ? <span className="mt-0.5 block truncate text-xs text-navy/40">{assignment.email}</span> : null}</div>
              <span className="w-fit rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-brand-700">Explanation editor</span>
              <button type="button" onClick={() => void revoke(assignment)} disabled={busyEmail === assignment.email} className="min-h-10 cursor-pointer rounded-xl border border-danger/20 px-3 text-xs font-extrabold text-danger-600 transition-colors hover:bg-danger-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-wait disabled:opacity-60 sm:justify-self-end">Remove access</button>
            </div>
          )) : <p className="px-5 py-10 text-center text-sm text-navy/45">No explanation editors have been assigned.</p>}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="px-5 py-4"><strong className="font-display text-2xl font-extrabold tabular-nums text-navy">{value.toLocaleString()}</strong><span className="mt-1 block text-xs font-semibold text-navy/45">{label}</span></div>;
}

function formatLastCompleted(value: string | null): string {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
