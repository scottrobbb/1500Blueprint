import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listAdminTests } from "@/lib/sat/admin-queries";
import { AdminShell } from "@/components/admin/AdminShell";
import { label } from "@/components/drills/shared/ui";

// Practice-test index: every test in the DB, linking to its content editor.
export default async function AdminTestsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/drills");

  const tests = await listAdminTests();

  return (
    <AdminShell active="tests" email={session.email}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-navy">Practice Tests</h1>
          <p className="mt-0.5 text-sm text-navy/55">
            Edit test settings and every question, choice, and explanation. Publish when a test is student-ready.
          </p>
        </div>

        {tests.length === 0 ? (
          <div className="rounded-card border border-dashed border-navy/20 bg-mist px-4 py-12 text-center text-sm text-navy/45">
            No tests found. Import a test first, then edit it here.
          </div>
        ) : (
          <ul className="divide-y divide-navy/10 overflow-hidden rounded-card border border-navy/15 bg-white">
            {tests.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/admin/tests/${t.slug}`}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-brand/5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-base font-bold text-navy">{t.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[13px] text-navy/50">
                      <span className="font-mono">{t.slug}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {t.questionCount} question{t.questionCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-chip px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${t.status === "published" ? "bg-success-bg text-success-600" : "bg-navy/8 text-navy/55"}`}>
                      {t.status}
                    </span>
                    {t.needsReviewCount > 0 ? (
                      <span className="inline-flex items-center rounded-chip bg-gold/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gold-600">
                        {t.needsReviewCount} to review
                      </span>
                    ) : null}
                    <span className={`${label} text-navy/35`}>Edit</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
