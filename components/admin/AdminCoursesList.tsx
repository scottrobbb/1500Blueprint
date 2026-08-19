"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { auditCourse } from "@/lib/courses/audit";
import type { Course } from "@/lib/courses/types";

export function AdminCoursesList({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const audited = useMemo(() => courses.map((course) => ({ course, audit: auditCourse(course) })), [courses]);
  const visible = audited.filter(({ course }) => course.title.toLowerCase().includes(query.trim().toLowerCase()));
  const missingAssets = audited.reduce((total, item) => total + item.audit.missingAssets, 0);
  const nativePractices = audited.reduce((total, item) => total + item.audit.practiceCount, 0);

  async function create() {
    setCreating(true);
    const response = await fetch("/api/admin/courses", { method: "POST" });
    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    if (response.ok && data?.id) router.push(`/ultimate/admin/courses/${data.id}`);
    else setCreating(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-600">Course operations</p><h2 className="mt-1 font-display text-2xl font-extrabold text-navy">Course library</h2><p className="mt-1 text-sm text-navy/45">Build the curriculum, resolve missing assets, and publish native practices.</p></div><button type="button" onClick={create} disabled={creating} className="min-h-11 cursor-pointer rounded-xl bg-brand px-4 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60">{creating ? "Creating…" : "+ New course"}</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><Kpi label="Courses" value={String(courses.length)} detail={`${courses.filter((course) => course.status === "published").length} published`} /><Kpi label="Missing assets" value={String(missingAssets)} detail={missingAssets === 0 ? "Everything connected" : "Requires Scott's attention"} warning={missingAssets > 0} /><Kpi label="Native practices" value={String(nativePractices)} detail={`${audited.reduce((total, item) => total + item.audit.questionCount, 0)} questions`} /></div>
      <label className="mt-5 block"><span className="sr-only">Search courses</span><div className="relative"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses…" className="min-h-11 w-full rounded-xl border border-navy/15 bg-white pl-11 pr-4 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15" /></div></label>
      {visible.length > 0 ? <div className="mt-4 grid gap-3">{visible.map(({ course, audit }) => <Link key={course.id} href={`/ultimate/admin/courses/${course.id}`} className="group rounded-2xl border border-navy/10 bg-white p-4 transition-colors hover:border-brand/30 hover:bg-ice/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-5"><div className="flex flex-wrap items-start gap-4"><span className={`mt-1 h-3 w-3 flex-none rounded-full ${course.status === "published" ? "bg-success" : "bg-gold"}`} /><span className="min-w-0 flex-1"><strong className="block font-display text-base font-extrabold text-navy">{course.title}</strong><span className="mt-1 block text-xs text-navy/40">{course.modules.length} modules · {course.totalLessons} lessons · {course.status}</span></span><span className="text-sm font-extrabold text-brand-700 transition-transform group-hover:translate-x-0.5">Edit course →</span></div><div className="mt-4 grid gap-2 border-t border-navy/10 pt-4 sm:grid-cols-3"><CourseStat label="Readiness" value={`${audit.readiness}%`} /><CourseStat label="Practices" value={`${audit.practiceCount} · ${audit.questionCount} questions`} /><CourseStat label="Missing" value={audit.missingAssets === 0 ? "None" : `${audit.missingAssets} asset${audit.missingAssets === 1 ? "" : "s"}`} warning={audit.missingAssets > 0} /></div></Link>)}</div> : <div className="mt-4 grid min-h-48 place-items-center rounded-2xl border border-dashed border-navy/15 bg-haze/40 text-center"><div><strong className="block text-sm text-navy">No matching courses</strong><span className="mt-1 block text-xs text-navy/45">Try a different search or create a new course.</span></div></div>}
    </div>
  );
}

function Kpi({ label, value, detail, warning = false }: { label: string; value: string; detail: string; warning?: boolean }) { return <div className="rounded-2xl border border-navy/10 bg-haze/35 p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-navy/40">{label}</p><strong className="mt-2 block font-display text-2xl font-extrabold text-navy">{value}</strong><p className={`mt-1 text-xs font-semibold ${warning ? "text-[#8a6500]" : "text-navy/40"}`}>{detail}</p></div>; }
function CourseStat({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <span className="flex items-center justify-between rounded-xl bg-haze/55 px-3 py-2 text-[11px]"><span className="font-bold text-navy/40">{label}</span><strong className={warning ? "text-[#8a6500]" : "text-navy/65"}>{value}</strong></span>; }
function SearchIcon() { return <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/35" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" strokeLinecap="round" /></svg>; }
