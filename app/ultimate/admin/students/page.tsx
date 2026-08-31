import { notFound } from "next/navigation";
import { StudentsTable } from "@/components/admin/StudentsTable";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listAdminGrants, type AdminGrant } from "@/lib/auth/grants";
import { listStudents } from "@/lib/gamification/state";

export default async function UltimateAdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing_refund?: string; rate_limit_reset?: string; access_grant?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) notFound();
  const [students, grants, params] = await Promise.all([listStudents(), listAdminGrants(), searchParams]);
  return (
    <UltimateAdminFrame active="students" email={session.email}>
      <ComplimentaryAccessPanel grants={grants} state={params.access_grant} />
      <RefundPanel state={params.billing_refund} />
      <RateLimitResetPanel state={params.rate_limit_reset} />
      <StudentsTable students={students} />
    </UltimateAdminFrame>
  );
}

function ComplimentaryAccessPanel({ grants, state }: { grants: AdminGrant[]; state?: string }) {
  const messages: Record<string, string> = {
    granted: "Max access granted. It applies the next time they load a page -- no sign-out needed.",
    replaced: "That student already had complimentary access; it was replaced with a fresh Max grant.",
    revoked: "Complimentary access revoked. They drop back to whatever their subscription entitles them to.",
    not_granted: "That student has no complimentary access to revoke.",
    invalid: "Enter a valid email address first.",
    error: "The grant could not be saved. Check the error log before retrying.",
  };
  const failed = state === "invalid" || state === "error" || state === "not_granted";

  return (
    <section className="mb-6 rounded-card border border-navy/15 bg-white p-4 sm:p-5" aria-labelledby="complimentary-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h2 id="complimentary-heading" className="font-display text-lg font-extrabold text-navy">Complimentary Max access</h2>
          <p className="mt-1 text-sm leading-6 text-navy/65">
            Gives a student every Max entitlement without a Stripe subscription, and outranks whatever plan they are on. Revoke at any time. Granting for an email with no account yet creates one, so it is waiting when they sign up.
          </p>
        </div>
        <form action="/api/admin/access-grants" method="post" className="flex w-full flex-col gap-2 lg:max-w-xl">
          <label htmlFor="grant-email" className="sr-only">Student email</label>
          <input
            id="grant-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="student@example.com"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-navy/15 bg-white px-3.5 text-base text-navy outline-none transition-colors duration-200 placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm"
          />
          <label htmlFor="grant-reason" className="sr-only">Reason</label>
          <input
            id="grant-reason"
            name="reason"
            type="text"
            maxLength={200}
            autoComplete="off"
            placeholder="Reason (optional, shown only to staff)"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-navy/15 bg-white px-3.5 text-base text-navy outline-none transition-colors duration-200 placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              name="intent"
              value="grant"
              className="min-h-11 flex-1 cursor-pointer rounded-xl bg-brand px-4 text-sm font-extrabold text-white transition-colors duration-200 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Grant Max access
            </button>
            <button
              type="submit"
              name="intent"
              value="revoke"
              formNoValidate
              className="min-h-11 cursor-pointer rounded-xl border border-navy/20 bg-white px-4 text-sm font-extrabold text-navy transition-colors duration-200 hover:bg-haze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy sm:px-5"
            >
              Revoke
            </button>
          </div>
        </form>
      </div>

      {state ? (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${failed ? "border-red-200 bg-white text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
        >
          {messages[state] ?? messages.error}
        </p>
      ) : null}

      {grants.length > 0 ? (
        <div className="mt-5 border-t border-navy/10 pt-4">
          <h3 className="text-sm font-extrabold text-navy">{grants.length} student{grants.length === 1 ? "" : "s"} with complimentary access</h3>
          <ul className="mt-2.5 divide-y divide-navy/10">
            {grants.map((grant) => (
              <li key={`${grant.email}-${grant.createdAt}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="text-sm font-semibold text-navy">{grant.email}</span>
                <span className="text-xs text-navy/55">
                  {grant.plan === "max" ? "Max" : grant.plan === "core" ? "Core" : "Free"}
                  {grant.reason ? ` · ${grant.reason}` : ""}
                  {grant.grantedBy ? ` · by ${grant.grantedBy}` : ""}
                  {grant.expiresAt ? ` · until ${new Date(grant.expiresAt).toLocaleDateString()}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function RefundPanel({ state }: { state?: string }) {
  const messages: Record<string, string> = {
    success: "Refund completed and the subscription was canceled immediately.",
    account: "That student account could not be found.",
    subscription: "That student has no Stripe purchase in the current billing mode.",
    window: "The student is outside the 24-hour first-purchase refund window.",
    already: "That first purchase was already refunded.",
    payment: "No paid Stripe invoice payment could be refunded.",
    processing: "A refund for that purchase is already being processed.",
    error: "Stripe could not complete the refund. Check the billing event log before retrying.",
  };

  return (
    <section className="mb-6 rounded-card border border-red-200 bg-red-50/70 p-4 sm:p-5" aria-labelledby="refund-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-red-700">Billing control</p>
          <h2 id="refund-heading" className="mt-1 font-display text-lg font-extrabold text-navy">Refund a first purchase</h2>
          <p className="mt-1 text-sm leading-6 text-navy/65">
            Available only during the first 24 hours. This refunds every paid invoice on the first subscription and cancels access immediately.
          </p>
        </div>
        <form action="/api/admin/billing/refund" method="post" className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
          <label htmlFor="refund-email" className="sr-only">Student email</label>
          <input
            id="refund-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="student@example.com"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-red-200 bg-white px-3.5 text-base text-navy outline-none transition-colors duration-200 placeholder:text-navy/35 focus:border-red-500 focus:ring-2 focus:ring-red-200 sm:text-sm"
          />
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-xl bg-red-700 px-4 text-sm font-extrabold text-white transition-colors duration-200 hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Refund &amp; cancel
          </button>
        </form>
      </div>
      {state ? (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${state === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-white text-red-800"}`}
        >
          {messages[state] ?? messages.error}
        </p>
      ) : null}
    </section>
  );
}

function RateLimitResetPanel({ state }: { state?: string }) {
  const messages: Record<string, string> = {
    success: "That student's content-read limits were cleared. They can browse normally right away.",
    none: "No active limits were found for that email -- they weren't actually blocked.",
    invalid: "Enter the student's email first.",
    error: "The reset could not be completed. Check the error log before retrying.",
  };

  return (
    <section className="mb-6 rounded-card border border-navy/15 bg-white p-4 sm:p-5" aria-labelledby="rate-limit-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-navy/45">Access control</p>
          <h2 id="rate-limit-heading" className="mt-1 font-display text-lg font-extrabold text-navy">Reset content read limits</h2>
          <p className="mt-1 text-sm leading-6 text-navy/65">
            Clears every burst and daily anti-abuse limit (courses, drills, practice tests, question bank) for one student, so a stuck daily window doesn&apos;t block them for the rest of the day.
          </p>
        </div>
        <form action="/api/admin/rate-limits/reset" method="post" className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
          <label htmlFor="rate-limit-email" className="sr-only">Student email</label>
          <input
            id="rate-limit-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="student@example.com"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-navy/15 bg-white px-3.5 text-base text-navy outline-none transition-colors duration-200 placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm"
          />
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-xl bg-navy px-4 text-sm font-extrabold text-white transition-colors duration-200 hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            Reset limits
          </button>
        </form>
      </div>
      {state ? (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${state === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-navy/15 bg-mist text-navy/70"}`}
        >
          {messages[state] ?? messages.error}
        </p>
      ) : null}
    </section>
  );
}
