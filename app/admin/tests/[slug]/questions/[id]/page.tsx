import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getAdminQuestion, getNextAdminQuestionId } from "@/lib/sat/admin-queries";
import { AdminShell } from "@/components/admin/AdminShell";
import { TestQuestionEditor } from "@/components/admin/TestQuestionEditor";

// Single practice-test question editor. Next 16: params is a Promise. The
// question's stored module -> test context must match the slug in the URL so a
// mismatched link can't open a question under the wrong test.
export default async function AdminTestQuestionPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const { slug, id } = await params;
  const [question, nextQuestionId] = await Promise.all([
    getAdminQuestion(id),
    getNextAdminQuestionId(slug, id),
  ]);
  if (!question || question.context?.testSlug !== slug) notFound();

  return (
    <AdminShell active="tests" email={session.email}>
      <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-navy/55">
        <Link href="/admin/tests" className="transition-colors hover:text-navy">
          Practice tests
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/admin/tests/${slug}`} className="transition-colors hover:text-navy">
          {question.context?.testTitle ?? slug}
        </Link>
      </div>
      <TestQuestionEditor
        key={question.id}
        question={question}
        nextQuestionHref={nextQuestionId ? `/admin/tests/${slug}/questions/${nextQuestionId}` : null}
      />
    </AdminShell>
  );
}
