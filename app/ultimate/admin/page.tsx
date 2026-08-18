import { notFound } from "next/navigation";
import { QuestionBank } from "@/components/admin/QuestionBank";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listDrills, listQuestions, listSkills } from "@/lib/drills/admin-queries";

export const metadata = { title: "Admin Question Bank" };

export default async function UltimateAdminPage() {
  const session = await getAdminSession();
  if (!session) notFound();

  const [drills, skills, { questions, total }] = await Promise.all([
    listDrills(),
    listSkills(),
    listQuestions({}, 1, 25),
  ]);

  return (
    <UltimateAdminFrame active="bank" email={session.email}>
      <QuestionBank
        initialQuestions={questions}
        total={total}
        drills={drills}
        skills={skills}
        basePath="/ultimate/admin"
      />
    </UltimateAdminFrame>
  );
}
