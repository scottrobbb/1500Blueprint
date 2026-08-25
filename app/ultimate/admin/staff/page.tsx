import { notFound } from "next/navigation";
import { StaffRoleManager } from "@/components/admin/StaffRoleManager";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listStaffRoles } from "@/lib/auth/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff Roles" };

export default async function UltimateAdminStaffPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  return (
    <UltimateAdminFrame active="staff" email={session.email}>
      <StaffRoleManager initialAssignments={await listStaffRoles()} />
    </UltimateAdminFrame>
  );
}
