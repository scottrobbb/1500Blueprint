import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getAdminTest } from "@/lib/sat/admin-queries";
import { AdminShell } from "@/components/admin/AdminShell";
import { TestSettingsForm } from "@/components/admin/TestSettingsForm";
import { TestOutline } from "@/components/admin/TestOutline";

// Per-test editor: settings form + the module/question outline. Next 16: params
// is a Promise.
export default async function AdminTestPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const { slug } = await params;
  const test = await getAdminTest(slug);
  if (!test) notFound();

  return (
    <AdminShell active="tests" email={session.email}>
      <div className="mb-4">
        <Link
          href="/admin/tests"
          className="text-[13px] font-semibold text-navy/55 transition-colors hover:text-navy"
        >
          ← All practice tests
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-navy">{test.title}</h1>
        </div>
        <TestSettingsForm test={test} />
        <TestOutline test={test} />
      </div>
    </AdminShell>
  );
}
