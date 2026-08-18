import Link from "next/link";
import { notFound } from "next/navigation";
import { TestQuestionEditor } from "@/components/admin/TestQuestionEditor";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getAdminQuestion, getNextAdminQuestionId } from "@/lib/sat/admin-queries";

export default async function UltimateTestQuestionPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const session = await getAdminSession();
  if (!session) notFound();
  const { slug, id } = await params;
  const [question, nextQuestionId] = await Promise.all([getAdminQuestion(id), getNextAdminQuestionId(slug, id)]);
  if (!question || question.context?.testSlug !== slug) notFound();
  const testHref = `/ultimate/admin/tests/${slug}`;

  return (
    <UltimateAdminFrame active="tests" email={session.email}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-navy/50">
        <Link href="/ultimate/admin/tests" className="hover:text-navy">Practice tests</Link>
        <span>/</span>
        <Link href={testHref} className="hover:text-navy">{question.context?.testTitle ?? slug}</Link>
      </div>
      <TestQuestionEditor
        key={question.id}
        question={question}
        nextQuestionHref={nextQuestionId ? `${testHref}/questions/${nextQuestionId}` : null}
        testsBasePath="/ultimate/admin/tests"
      />
    </UltimateAdminFrame>
  );
}
