"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffRoleAssignment } from "@/lib/auth/staff";

export function StaffRoleManager({ initialAssignments }: { initialAssignments: StaffRoleAssignment[] }) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [email, setEmail] = useState("");
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <div className="max-w-2xl"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Scoped access</p><h2 className="mt-1 font-display text-2xl font-extrabold text-navy">Explanation team</h2><p className="mt-2 text-sm leading-6 text-navy/55">Editors can see the prompt, answer, and current rationale, then update only the explanation. They cannot change answers, publish content, edit billing, or access this admin panel.</p></div>
        <Link href="/manager" className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 text-sm font-extrabold text-white hover:bg-brand-600">Open manager workspace →</Link>
      </div>

      <form onSubmit={grant} className="mt-6 flex flex-col gap-2 rounded-2xl border border-brand/20 bg-ice/45 p-4 sm:flex-row">
        <label htmlFor="staff-email" className="sr-only">Blueprint account email</label>
        <input id="staff-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="editor@example.com" className="min-h-11 min-w-0 flex-1 rounded-xl border border-navy/15 bg-white px-3 text-base text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm" />
        <button type="submit" disabled={Boolean(busyEmail)} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60">{busyEmail ? "Granting…" : "Grant explanation access"}</button>
      </form>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-600">{error}</p> : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-navy/10">
        <div className="hidden grid-cols-[minmax(0,1fr)_190px_140px] bg-haze px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.13em] text-navy/40 sm:grid"><span>Team member</span><span>Access</span><span className="text-right">Action</span></div>
        {assignments.length ? assignments.map((assignment) => (
          <div key={`${assignment.email}-${assignment.role}`} className="grid gap-3 border-t border-navy/10 px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_190px_140px] sm:items-center">
            <div className="min-w-0"><strong className="block truncate text-sm text-navy">{assignment.name || assignment.email}</strong>{assignment.name ? <span className="mt-0.5 block truncate text-xs text-navy/40">{assignment.email}</span> : null}</div>
            <span className="w-fit rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-brand-700">Explanation editor</span>
            <button type="button" onClick={() => void revoke(assignment)} disabled={busyEmail === assignment.email} className="min-h-10 cursor-pointer rounded-xl border border-danger/20 px-3 text-xs font-extrabold text-danger-600 hover:bg-danger-bg disabled:cursor-wait disabled:opacity-60 sm:justify-self-end">Remove access</button>
          </div>
        )) : <p className="px-5 py-10 text-center text-sm text-navy/45">No explanation editors have been assigned.</p>}
      </div>
    </div>
  );
}
