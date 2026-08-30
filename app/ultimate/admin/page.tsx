import { notFound } from "next/navigation";
import { QuestionBank } from "@/components/admin/QuestionBank";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listDrills, listQuestions, listSkills, parseQuestionFilters, questionFiltersSearchParams } from "@/lib/drills/admin-queries";

export const metadata = { title: "Admin Question Bank" };

// Reads filters/page from the URL so the first server-rendered paint already
// matches the filter bar -- including when the URL is restored by navigating
// back from a question editor.
export default async function UltimateAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (!session) notFound();

  const params = questionFiltersSearchParams(await searchParams);
  const { filters, page, pageSize } = parseQuestionFilters(params);

  const [drills, skills, { questions, total }] = await Promise.all([
    listDrills(),
    listSkills(),
    listQuestions(filters, page, pageSize),
  ]);

  return (
    <UltimateAdminFrame active="bank" email={session.email}>
      <QuestionBank
        initialQuestions={questions}
        total={total}
        drills={drills}
        skills={skills}
        basePath="/ultimate/admin"
        initialFilters={filters}
        initialPage={page}
      />
    </UltimateAdminFrame>
  );
}
