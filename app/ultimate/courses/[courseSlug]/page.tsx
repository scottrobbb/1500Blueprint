import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCourseForStudent } from "@/lib/courses/queries";
import { canAccessCourse, getStudentAccess } from "@/lib/auth/entitlements";
import { AccessGate } from "@/components/account/AccessGate";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ courseSlug: string }> };

export default async function UltimateCoursePage({ params }: Props) {
  const session = await getSession();
  if (!session) notFound();
  const { courseSlug } = await params;
  const access = await getStudentAccess(session.email);
  if (!canAccessCourse(access, courseSlug)) return <AccessGate title="Unlock the complete Blueprint curriculum" description="Advanced Math and Reading & Writing subtopic courses are included with Max." currentPlan={access.plan} />;
  const course = await getCourseForStudent(courseSlug, session.email);
  if (!course) notFound();
  const nextLesson = course.modules.flatMap((module) => module.lessons).find((lesson) => !lesson.completed) ?? course.modules[0]?.lessons[0];

  return (
    <div className="min-h-dvh bg-[#f5f6f8]">
      <header className="bg-[linear-gradient(125deg,#0b2a5b,#164582_68%,#2b8fe0)] px-4 py-8 text-white sm:px-7 sm:py-11">
        <div className="mx-auto max-w-[1120px]">
          <Link href="/ultimate/courses" aria-label="Back to all courses" className="group inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3.5 text-[13px] font-bold text-white/80 shadow-[0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm transition duration-200 hover:border-white/25 hover:bg-white/[0.14] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5"><path d="m15 18-6-6 6-6" /></svg>
            <span>All courses</span>
          </Link>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-sky">{course.eyebrow ?? "1500 Blueprint course"}</p>
          <h1 className="mt-2 max-w-3xl font-display text-[34px] font-extrabold leading-tight tracking-[-0.04em] sm:text-[46px]">{course.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">{course.description}</p>
          <div className="mt-6 flex max-w-2xl items-center gap-4"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gold" style={{ width: `${course.progress}%` }} /></div><span className="text-xs font-bold">{course.completedLessons}/{course.totalLessons} complete</span></div>
          {nextLesson ? <Link href={`/ultimate/courses/${course.slug}/${nextLesson.slug}`} className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-[0_2px_0_#1879c4]">{course.progress > 0 ? "Continue learning" : "Start course"} →</Link> : null}
        </div>
      </header>
      <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-7">
        <div className="space-y-5">
          {course.modules.map((module, moduleIndex) => {
            const isFoundationsCourse = course.slug === "blueprint-foundations";
            const completedDays = module.lessons.filter((lesson) => lesson.completed).length;
            const weekProgress = module.lessons.length > 0 ? Math.round((completedDays / module.lessons.length) * 100) : 0;
            return (
              <section key={module.id} className="overflow-hidden rounded-[18px] border border-navy/10 bg-white shadow-pop">
                <header className="border-b border-navy/10 bg-haze/60 px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand-600">{isFoundationsCourse ? `Week ${moduleIndex + 1}` : `Module ${moduleIndex + 1}`}</p>
                      <h2 className="mt-1 font-display text-xl font-extrabold text-navy sm:text-2xl">{module.title}</h2>
                      {module.description ? <p className="mt-1.5 text-sm leading-6 text-navy/50">{module.description}</p> : null}
                    </div>
                    <span className="rounded-full border border-navy/10 bg-white px-3 py-1.5 text-xs font-bold text-navy/50">{completedDays}/{module.lessons.length} {isFoundationsCourse ? "day groups" : "lessons"}</span>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-navy/[0.07]" aria-label={`${weekProgress}% of this week complete`}><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${weekProgress}%` }} /></div>
                </header>
                <ol className="divide-y divide-navy/10">
                  {module.lessons.map((lesson, lessonIndex) => <li key={lesson.id}><Link href={`/ultimate/courses/${course.slug}/${lesson.slug}`} className="group flex min-h-[82px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-ice/50 focus-visible:bg-ice/50 focus-visible:outline-none sm:px-6"><span className={`grid h-9 w-9 flex-none place-items-center rounded-xl text-xs font-extrabold ${lesson.completed ? "bg-success text-white" : "bg-navy/7 text-navy/45"}`}>{lesson.completed ? "✓" : lessonIndex + 1}</span><span className="min-w-0 flex-1"><strong className="block text-sm text-navy sm:text-[15px]">{lesson.title}</strong><span className="mt-1 line-clamp-2 block text-xs leading-5 text-navy/40">{lesson.estimatedMinutes || 5} min{lesson.summary ? ` · ${lesson.summary}` : ""}</span></span><span className="text-brand transition-transform group-hover:translate-x-1">→</span></Link></li>)}
                </ol>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
