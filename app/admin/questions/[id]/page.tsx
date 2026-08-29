import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getDrill, getQuestion, listSkills } from "@/lib/drills/admin-queries";
import { AdminShell } from "@/components/admin/AdminShell";
import { QuestionEditor } from "@/components/admin/editor/QuestionEditor";

// Single-question authoring page. Loads the question (with walkthrough), its
// drill config, and the skill taxonomy, then hands them to the editor shell.
export default async function QuestionEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/ultimate");

  const { id } = await params;
  const question = await getQuestion(id);
  if (!question) notFound();

  const [drill, skills] = await Promise.all([
    getDrill(question.drillSlug),
    listSkills(),
  ]);
  if (!drill) notFound();

  return (
    <AdminShell active="bank" email={session.email}>
      <QuestionEditor initialQuestion={question} drill={drill} skills={skills} />
    </AdminShell>
  );
}
