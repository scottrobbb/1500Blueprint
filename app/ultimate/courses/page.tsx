/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ultimate/PageHeader";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { listCoursesForStudent } from "@/lib/courses/queries";
import { canAccessCourse, getStudentAccess } from "@/lib/auth/entitlements";
import { PlanBadge } from "@/components/account/PlanBadge";

export const metadata = { title: "Courses" };
export const dynamic = "force-dynamic";

export default async function UltimateCoursesPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const [courses, access] = await Promise.all([listCoursesForStudent(session.email), getStudentAccess(session.email)]);
  const unlockedCourses = courses.filter((course) => canAccessCourse(access, course.slug));
  const totalLessons = unlockedCourses.reduce((sum, course) => sum + course.totalLessons, 0);
  const completedLessons = unlockedCourses.reduce((sum, course) => sum + course.completedLessons, 0);

  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 py-7 sm:px-7 sm:py-10">
      <PageHeader eyebrow="Learning" title="Courses" description="Learn Scott's SAT system in order, then practice each skill in the Question Bank." />
      {courses.length > 0 ? (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            <Metric label="Available courses" value={String(unlockedCourses.length)} />
            <Metric label="Lessons complete" value={`${completedLessons}/${totalLessons}`} />
            <Metric label="Overall progress" value={totalLessons ? `${Math.round((completedLessons / totalLessons) * 100)}%` : "0%"} />
          </section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-ice/60 px-4 py-3"><div className="flex items-center gap-2.5"><PlanBadge plan={access.plan} test={access.isTestAccount} /><span className="text-xs font-semibold text-navy/55">{access.entitlements.allCourses ? "All published courses are unlocked." : "Blueprint Foundations is included. Advanced subtopic courses require Max."}</span></div>{!access.entitlements.allCourses ? <Link href="/pricing" className="text-xs font-extrabold text-brand-700 hover:text-navy">Unlock every course →</Link> : null}</div>
          <section className="grid gap-5 md:grid-cols-2">
            {courses.map((course) => {
              const locked = !canAccessCourse(access, course.slug);
              return (
              <Link key={course.id} href={locked ? "/pricing" : `/ultimate/courses/${course.slug}`} className={`group relative overflow-hidden rounded-[20px] border bg-white shadow-pop transition-all ${locked ? "border-navy/10 opacity-75" : "border-navy/10 hover:-translate-y-0.5 hover:border-brand/35"}`}>
                <div className="relative min-h-44 overflow-hidden bg-[linear-gradient(125deg,#0b2a5b,#174b91_65%,#3fa9f5)] p-6 text-white">
                  {course.coverUrl ? <img src={course.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" /> : null}
                  <div className="relative">
                    <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-sky">{course.eyebrow ?? "1500 Blueprint course"}</p>
                    <h2 className="mt-2 max-w-lg font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em]">{course.title}</h2>
                    <p className="mt-3 text-xs font-semibold text-white/60">{course.modules.length} modules · {course.totalLessons} lessons</p>{locked ? <span className="mt-4 inline-flex rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">Max course</span> : null}
                  </div>
                </div>
                <div className="p-5">
                  <p className="line-clamp-2 min-h-10 text-sm leading-5 text-navy/55">{course.description ?? "Open the curriculum and start with the first lesson."}</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy/[0.07]"><div className="h-full rounded-full bg-brand" style={{ width: `${course.progress}%` }} /></div>
                    <span className="text-xs font-bold tabular-nums text-navy/45">{course.progress}%</span>
                  </div>
                  <span className="mt-4 inline-flex min-h-11 items-center text-sm font-extrabold text-brand-600">{locked ? "Upgrade to unlock" : course.progress > 0 ? "Continue course" : "Start course"} <span className="ml-2 transition-transform group-hover:translate-x-1">→</span></span>
                </div>
              </Link>
            );})}
          </section>
        </>
      ) : (
        <section className="grid min-h-72 place-items-center rounded-[20px] border border-dashed border-navy/15 bg-white px-6 text-center">
          <div className="max-w-md"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ice text-brand"><BookIcon /></span><h2 className="mt-4 font-display text-xl font-extrabold text-navy">Course content is being prepared</h2><p className="mt-2 text-sm leading-6 text-navy/50">Scott&apos;s Blueprint curriculum will appear here as soon as the first modules are published.</p></div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-navy/10 bg-white px-5 py-4 shadow-pop"><strong className="font-display text-2xl font-extrabold text-navy">{value}</strong><span className="mt-1 block text-xs font-semibold text-navy/40">{label}</span></div>; }
function BookIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" strokeLinejoin="round" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></svg>; }
