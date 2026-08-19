"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import {
  grantComplimentaryAccessAction,
  revokeComplimentaryAccessAction,
  type AccessActionState,
} from "@/app/admin/access/actions";
import type { ComplimentaryAccessUser } from "@/lib/auth/users";

const INITIAL_ACTION_STATE: AccessActionState = { status: "idle", message: "" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const [year, month, day] = iso.slice(0, 10).split("-");
  const monthIndex = Number(month) - 1;
  if (!year || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return iso.slice(0, 10);
  }
  return `${MONTHS[monthIndex]} ${Number(day)}, ${year}`;
}

export function ComplimentaryAccessManager({ users }: { users: ComplimentaryAccessUser[] }) {
  const [query, setQuery] = useState("");
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [revokeState, setRevokeState] = useState<AccessActionState>(INITIAL_ACTION_STATE);
  const [isRevoking, startRevokeTransition] = useTransition();
  const [addState, addAction, isAdding] = useActionState(
    grantComplimentaryAccessAction,
    INITIAL_ACTION_STATE,
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return users;
    return users.filter((user) => user.email.includes(normalizedQuery));
  }, [query, users]);

  function revoke(emailToRevoke: string) {
    startRevokeTransition(async () => {
      const result = await revokeComplimentaryAccessAction(emailToRevoke);
      setRevokeState(result);
      if (result.status === "success") setConfirmEmail(null);
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">
            Complimentary access
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-navy/55">
            Manage students who can sign in without a Stripe membership. Revoking access
            preserves their account, progress, and history.
          </p>
        </div>
        <span className="rounded-chip border border-brand/25 bg-ice px-3 py-1.5 text-sm font-bold text-brand-600">
          {users.length} active {users.length === 1 ? "grant" : "grants"}
        </span>
      </div>

      <section className="mb-6 grid overflow-hidden rounded-card border border-navy/12 bg-white lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-card bg-navy text-white">
              <PlusIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-extrabold text-navy">Add a student</h2>
              <p className="text-sm text-navy/50">They can request the normal email login link immediately.</p>
            </div>
          </div>

          <form action={addAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-semibold text-navy" htmlFor="complimentary-email">
              Email address
              <input
                id="complimentary-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="student@example.com"
                className="mt-1.5 min-h-11 w-full rounded-card border border-navy/20 bg-white px-3.5 py-2 text-base font-normal text-ink outline-none transition-colors placeholder:text-navy/30 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={isAdding}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-card bg-navy px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <PlusIcon className="h-4 w-4" />
              {isAdding ? "Adding…" : "Grant access"}
            </button>
          </form>

          <ActionMessage state={addState} className="mt-3" />
        </div>

        <div className="border-t border-navy/10 bg-mist p-5 sm:p-6 lg:border-l lg:border-t-0">
          <h2 className="text-sm font-bold text-navy">What this changes</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-navy/60">
            <li className="flex gap-2.5">
              <CheckIcon className="mt-0.5 h-4 w-4 flex-none text-success" />
              Bypasses only the Stripe membership lookup.
            </li>
            <li className="flex gap-2.5">
              <CheckIcon className="mt-0.5 h-4 w-4 flex-none text-success" />
              Keeps the same secure, expiring magic-link login.
            </li>
            <li className="flex gap-2.5">
              <CheckIcon className="mt-0.5 h-4 w-4 flex-none text-success" />
              Revocation invalidates complimentary sessions and unused links.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <label className="sr-only" htmlFor="complimentary-search">Search complimentary students</label>
          <input
            id="complimentary-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email…"
            className="min-h-11 w-full max-w-xs rounded-card border border-navy/20 bg-white px-3.5 py-2 text-base text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm"
          />
          <span className="text-sm text-navy/50">
            {filteredUsers.length} {filteredUsers.length === 1 ? "student" : "students"}
            {query ? ` of ${users.length}` : ""}
          </span>
        </div>

        <ActionMessage state={revokeState} className="mb-3" />

        {users.length === 0 ? (
          <EmptyState />
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-card border border-dashed border-navy/20 bg-white px-6 py-12 text-center">
            <p className="font-display text-lg font-bold text-navy">No matching students</p>
            <p className="mt-1 text-sm text-navy/50">Try a different email search.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-card border border-navy/12 bg-white md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-navy/10 bg-mist text-[11px] font-bold uppercase tracking-[0.1em] text-navy/45">
                    <th className="px-4 py-3 font-bold">Student</th>
                    <th className="px-4 py-3 font-bold">Logins</th>
                    <th className="px-4 py-3 font-bold">Last login</th>
                    <th className="px-4 py-3 font-bold">Account created</th>
                    <th className="px-4 py-3 text-right font-bold">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.email} className="border-b border-navy/[0.07] last:border-0 hover:bg-brand/[0.04]">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-ink">{user.email}</div>
                        <div className="mt-0.5 text-xs font-semibold text-success-600">Complimentary</div>
                      </td>
                      <td className="px-4 py-3.5 font-semibold tabular-nums text-navy/70">{user.loginCount}</td>
                      <td className="px-4 py-3.5 text-navy/60">{formatDate(user.lastLoginAt)}</td>
                      <td className="px-4 py-3.5 text-navy/60">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <RevokeControls
                          email={user.email}
                          confirming={confirmEmail === user.email}
                          busy={isRevoking && confirmEmail === user.email}
                          onRequest={() => setConfirmEmail(user.email)}
                          onCancel={() => setConfirmEmail(null)}
                          onConfirm={() => revoke(user.email)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {filteredUsers.map((user) => (
                <article key={user.email} className="rounded-card border border-navy/12 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-semibold text-ink">{user.email}</p>
                      <p className="mt-0.5 text-xs font-semibold text-success-600">Complimentary</p>
                    </div>
                    <span className="rounded-chip bg-navy/5 px-2 py-1 text-xs font-semibold text-navy/60">
                      {user.loginCount} {user.loginCount === 1 ? "login" : "logins"}
                    </span>
                  </div>
                  <dl className="my-4 grid grid-cols-2 gap-3 border-y border-navy/8 py-3 text-sm">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-navy/40">Last login</dt>
                      <dd className="mt-1 text-navy/65">{formatDate(user.lastLoginAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-navy/40">Created</dt>
                      <dd className="mt-1 text-navy/65">{formatDate(user.createdAt)}</dd>
                    </div>
                  </dl>
                  <RevokeControls
                    email={user.email}
                    confirming={confirmEmail === user.email}
                    busy={isRevoking && confirmEmail === user.email}
                    onRequest={() => setConfirmEmail(user.email)}
                    onCancel={() => setConfirmEmail(null)}
                    onConfirm={() => revoke(user.email)}
                  />
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function RevokeControls({
  email,
  confirming,
  busy,
  onRequest,
  onCancel,
  onConfirm,
}: {
  email: string;
  confirming: boolean;
  busy: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onRequest}
        className="min-h-11 cursor-pointer rounded-card border border-danger/30 px-3 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger-bg"
      >
        Revoke
      </button>
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center justify-end gap-2" aria-label={`Confirm revoking ${email}`}>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="min-h-11 cursor-pointer rounded-card bg-danger px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-danger-600 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {busy ? "Revoking…" : "Confirm revoke"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="min-h-11 cursor-pointer rounded-card px-3 py-2 text-sm font-semibold text-navy/60 transition-colors hover:bg-navy/5 hover:text-navy disabled:cursor-not-allowed disabled:opacity-55"
      >
        Cancel
      </button>
    </div>
  );
}

function ActionMessage({ state, className = "" }: { state: AccessActionState; className?: string }) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`${className} rounded-card border px-3 py-2 text-sm font-semibold ${
        state.status === "error"
          ? "border-danger/25 bg-danger-bg text-danger-600"
          : "border-success/25 bg-success-bg text-success-600"
      }`}
    >
      {state.message}
    </p>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-dashed border-navy/20 bg-white px-6 py-14 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-card bg-navy/5 text-navy/50">
        <UserIcon className="h-5 w-5" />
      </span>
      <p className="mt-3 font-display text-lg font-bold text-navy">No complimentary students</p>
      <p className="mt-1 text-sm text-navy/50">Add an email above to create the first grant.</p>
    </div>
  );
}

type IconProps = { className?: string };

function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-4 3.1-6 7-6s6.2 2 7 6" strokeLinecap="round" />
    </svg>
  );
}
