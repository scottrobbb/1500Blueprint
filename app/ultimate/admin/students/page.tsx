import { notFound } from "next/navigation";
import { StudentsTable } from "@/components/admin/StudentsTable";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listStudents } from "@/lib/gamification/state";

export default async function UltimateAdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing_refund?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) notFound();
  const [students, params] = await Promise.all([listStudents(), searchParams]);
  return (
    <UltimateAdminFrame active="students" email={session.email}>
      <RefundPanel state={params.billing_refund} />
      <StudentsTable students={students} />
    </UltimateAdminFrame>
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
