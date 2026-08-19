import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseEditor } from "@/components/admin/CourseEditor";
import { UltimateAdminFrame } from "@/components/ultimate/UltimateAdminFrame";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { getCourseForAdmin } from "@/lib/courses/queries";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
export default async function UltimateAdminCourseEditorPage({ params }: Props) {
  const session = await getAdminSession();
  if (!session) notFound();
  const { id } = await params;
  const course = await getCourseForAdmin(id, session.email);
  if (!course) notFound();
  return <UltimateAdminFrame active="courses" email={session.email}><Link href="/ultimate/admin/courses" className="mb-5 inline-flex min-h-11 items-center text-sm font-bold text-navy/50 hover:text-brand-600">← All courses</Link><CourseEditor initial={course} /></UltimateAdminFrame>;
}
