import Link from "next/link";
import { notFound } from "next/navigation";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listAdminTests } from "@/lib/sat/admin-queries";

export const metadata = { title: "Admin Practice Tests" };

export default async function UltimateAdminTestsPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  const tests = await listAdminTests();

  return (
    <UltimateAdminFrame active="tests" email={session.email}>
      <div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-navy">Practice tests</h2>
        <p className="mt-1 text-sm text-navy/50">Edit settings, modules, questions, choices, and explanations.</p>
      </div>
      {tests.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-navy/15 bg-haze/50 px-5 py-12 text-center text-sm text-navy/45">No tests found.</div>
      ) : (
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {tests.map((test) => (
            <li key={test.slug}>
              <Link href={`/ultimate/admin/tests/${test.slug}`} className="group flex min-h-24 items-center gap-4 rounded-2xl border border-navy/10 bg-haze/30 p-4 transition-colors hover:border-brand/35 hover:bg-ice/30">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-navy font-display text-sm font-extrabold text-white">{test.slug.match(/\d+$/)?.[0] ?? "T"}</span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate font-display text-base text-navy">{test.title}</strong>
                  <span className="mt-1 block text-xs text-navy/45">{test.questionCount} questions · {test.needsReviewCount} to review</span>
                </span>
                <span className="text-xs font-bold text-brand-600">Edit →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </UltimateAdminFrame>
  );
}
