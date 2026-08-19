import { notFound } from "next/navigation";
import { AdminCoursesList } from "@/components/admin/AdminCoursesList";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { listCoursesForAdmin } from "@/lib/courses/queries";

export const dynamic = "force-dynamic";
export default async function UltimateAdminCoursesPage() {
  const session = await getAdminSession();
  if (!session) notFound();
  return <UltimateAdminFrame active="courses" email={session.email}><AdminCoursesList courses={await listCoursesForAdmin(session.email)} /></UltimateAdminFrame>;
}
