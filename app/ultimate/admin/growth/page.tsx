import { notFound } from "next/navigation";
import { GrowthDashboard } from "@/components/admin/GrowthDashboard";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listStudents } from "@/lib/gamification/state";

export const metadata = { title: "Growth" };

export default async function UltimateAdminGrowthPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  const students = await listStudents();

  return (
    <UltimateAdminFrame active="growth" email={session.email}>
      <GrowthDashboard students={students} />
    </UltimateAdminFrame>
  );
}
