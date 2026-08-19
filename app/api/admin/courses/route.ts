import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/requireAdmin";
import { createCourse, listCoursesForAdmin } from "@/lib/courses/queries";

export async function POST() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const courses = await listCoursesForAdmin(session.email);
  const id = await createCourse(courses.length + 1);
  return id ? NextResponse.json({ id }, { status: 201 }) : NextResponse.json({ error: "create_failed" }, { status: 500 });
}
