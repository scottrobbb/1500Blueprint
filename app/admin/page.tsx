import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listDrills, listQuestions, listSkills, parseQuestionFilters, questionFiltersSearchParams } from "@/lib/drills/admin-queries";
import { AdminShell } from "@/components/admin/AdminShell";
import { QuestionBank } from "@/components/admin/QuestionBank";

// Admin landing: the question bank. Authorizes first, then loads the reference
// data + the requested page of questions on the server (reading filters/page
// from the URL) so the first paint already matches the filter bar -- including
// when the URL is restored by navigating back from a question editor.
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const params = questionFiltersSearchParams(await searchParams);
  const { filters, page, pageSize } = parseQuestionFilters(params);

  const [drills, skills, { questions, total }] = await Promise.all([
    listDrills(),
    listSkills(),
    listQuestions(filters, page, pageSize),
  ]);

  return (
    <AdminShell active="bank" email={session.email}>
      <QuestionBank
        initialQuestions={questions}
        total={total}
        drills={drills}
        skills={skills}
        initialFilters={filters}
        initialPage={page}
      />
    </AdminShell>
  );
}
