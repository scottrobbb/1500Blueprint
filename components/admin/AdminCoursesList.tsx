"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Course } from "@/lib/courses/types";

export function AdminCoursesList({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  async function create() {
    setCreating(true);
    const response = await fetch("/api/admin/courses", { method: "POST" });
    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    if (response.ok && data?.id) router.push(`/ultimate/admin/courses/${data.id}`);
    else setCreating(false);
  }
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-extrabold text-navy">Course library</h2><p className="mt-1 text-sm text-navy/45">Build, publish, and maintain the student curriculum.</p></div><button type="button" onClick={create} disabled={creating} className="min-h-11 cursor-pointer rounded-xl bg-brand px-4 text-sm font-extrabold text-white hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60">{creating ? "Creating…" : "+ New course"}</button></div>
      {courses.length > 0 ? <div className="divide-y divide-navy/10 rounded-2xl border border-navy/10">{courses.map((course) => <Link key={course.id} href={`/ultimate/admin/courses/${course.id}`} className="flex min-h-20 items-center gap-4 px-4 py-3 transition-colors hover:bg-haze/60"><span className={`h-2.5 w-2.5 rounded-full ${course.status === "published" ? "bg-success" : "bg-gold"}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-navy">{course.title}</strong><span className="mt-1 block text-xs text-navy/40">{course.modules.length} modules · {course.totalLessons} lessons · {course.status}</span></span><span className="text-brand">Edit →</span></Link>)}</div> : <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-navy/15 bg-haze/40 text-center"><div><strong className="block text-sm text-navy">No courses yet</strong><span className="mt-1 block text-xs text-navy/45">Create the first course to start building the curriculum.</span></div></div>}
    </div>
  );
}
