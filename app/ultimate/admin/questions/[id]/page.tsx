import { notFound } from "next/navigation";
import { QuestionEditor } from "@/components/admin/editor/QuestionEditor";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getDrill, getQuestion, listSkills } from "@/lib/drills/admin-queries";

export default async function UltimateQuestionEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) notFound();
  const { id } = await params;
  const question = await getQuestion(id);
  if (!question) notFound();
  const [drill, skills] = await Promise.all([getDrill(question.drillSlug), listSkills()]);
  if (!drill) notFound();

  return (
    <UltimateAdminFrame active="bank" email={session.email}>
      <QuestionEditor initialQuestion={question} drill={drill} skills={skills} backHref="/ultimate/admin" />
    </UltimateAdminFrame>
  );
}
