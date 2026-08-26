import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ultimate/PageHeader";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { listCoursesForStudent } from "@/lib/courses/queries";
import { canAccessCourse, getStudentAccess } from "@/lib/auth/entitlements";
import { LockedBadge, UpgradePrompt } from "@/components/account/UpgradePrompt";
import { CourseCover } from "@/components/ultimate/courses/CourseCover";

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
      <PageHeader eyebrow="Learning" title="Courses" description="Work through Scott's lessons in order, then practice the same skills in the Question Bank." />
      {courses.length > 0 ? (
        <>
          <section className="mb-7 grid overflow-hidden rounded-xl border border-navy/12 bg-white sm:grid-cols-3 sm:divide-x sm:divide-navy/10">
            <Metric label="Available courses" value={String(unlockedCourses.length)} />
            <Metric label="Lessons complete" value={`${completedLessons}/${totalLessons}`} />
            <Metric label="Overall progress" value={totalLessons ? `${Math.round((completedLessons / totalLessons) * 100)}%` : "0%"} />
          </section>
          {!access.entitlements.allCourses ? (
            <UpgradePrompt
              currentPlan={access.plan}
              requiredPlan="max"
              title="Max adds the full course library"
              description="Your Foundation course stays available. Max adds every Math and Reading & Writing course without changing your saved progress."
              features={["All advanced courses", "Embedded lesson practice", "Planner-linked assignments"]}
              className="mb-6"
            />
          ) : null}
          <section className="grid gap-4 md:grid-cols-2">
            {courses.map((course, courseIndex) => {
              const locked = !canAccessCourse(access, course.slug);
              return (
              <Link key={course.id} href={locked ? "/pricing" : `/ultimate/courses/${course.slug}`} className={`group overflow-hidden rounded-xl border bg-white transition-colors ${locked ? "border-gold/30 hover:border-gold/50" : "border-navy/12 hover:border-brand/35"}`}>
                <CourseCover src={course.coverUrl} title={course.title} eyebrow={course.eyebrow} priority={courseIndex === 0} className="border-b border-navy/10" />
                <div className="p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-brand-600">{course.eyebrow ?? "SAT course"}</p>{locked ? <LockedBadge plan="max" /> : null}</div>
                  <h2 className="mt-2 font-display text-[23px] font-semibold leading-tight tracking-[-0.03em] text-ink">{course.title}</h2>
                  <p className="mt-2 text-xs font-medium text-navy/45">{course.modules.length} modules · {course.totalLessons} lessons</p>
                  <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-navy/58">{course.description ?? "Open the course and start with the first lesson."}</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy/[0.07]"><div className="h-full rounded-full bg-brand" style={{ width: `${course.progress}%` }} /></div>
                    <span className="text-xs font-semibold tabular-nums text-navy/48">{course.progress}%</span>
                  </div>
                  <span className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-600">{locked ? "See Max plan" : course.progress > 0 ? "Continue course" : "Start course"} <span className="ml-2 transition-transform group-hover:translate-x-1">→</span></span>
                </div>
              </Link>
            );})}
          </section>
        </>
      ) : (
        <section className="grid min-h-64 place-items-center rounded-xl border border-dashed border-navy/15 bg-white px-6 text-center">
          <div className="max-w-md"><BookIcon /><h2 className="mt-4 font-display text-xl font-semibold text-navy">No courses are published yet</h2><p className="mt-2 text-sm leading-6 text-navy/52">Published modules will appear here.</p></div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="px-5 py-4"><strong className="font-display text-2xl font-semibold tabular-nums text-navy">{value}</strong><span className="mt-1 block text-xs font-medium text-navy/45">{label}</span></div>; }
function BookIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" strokeLinejoin="round" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></svg>; }
