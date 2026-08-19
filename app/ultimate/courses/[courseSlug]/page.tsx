import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCourseForStudent } from "@/lib/courses/queries";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ courseSlug: string }> };

export default async function UltimateCoursePage({ params }: Props) {
  const session = await getSession();
  if (!session) notFound();
  const { courseSlug } = await params;
  const course = await getCourseForStudent(courseSlug, session.email);
  if (!course) notFound();
  const nextLesson = course.modules.flatMap((module) => module.lessons).find((lesson) => !lesson.completed) ?? course.modules[0]?.lessons[0];

  return (
    <div className="min-h-dvh bg-[#f5f6f8]">
      <header className="bg-[linear-gradient(125deg,#0b2a5b,#164582_68%,#2b8fe0)] px-4 py-8 text-white sm:px-7 sm:py-11">
        <div className="mx-auto max-w-[1120px]">
          <Link href="/ultimate/courses" className="inline-flex min-h-11 items-center text-sm font-bold text-white/65 hover:text-white">← Back to courses</Link>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-sky">{course.eyebrow ?? "1500 Blueprint course"}</p>
          <h1 className="mt-2 max-w-3xl font-display text-[34px] font-extrabold leading-tight tracking-[-0.04em] sm:text-[46px]">{course.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">{course.description}</p>
          <div className="mt-6 flex max-w-2xl items-center gap-4"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gold" style={{ width: `${course.progress}%` }} /></div><span className="text-xs font-bold">{course.completedLessons}/{course.totalLessons} complete</span></div>
          {nextLesson ? <Link href={`/ultimate/courses/${course.slug}/${nextLesson.slug}`} className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-[0_2px_0_#1879c4]">{course.progress > 0 ? "Continue learning" : "Start course"} →</Link> : null}
        </div>
      </header>
      <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-7">
        <div className="space-y-5">
          {course.modules.map((module, moduleIndex) => (
            <section key={module.id} className="overflow-hidden rounded-[18px] border border-navy/10 bg-white shadow-pop">
              <header className="border-b border-navy/10 bg-haze/60 px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand-600">Module {moduleIndex + 1}</p><h2 className="mt-1 font-display text-xl font-extrabold text-navy">{module.title}</h2>{module.description ? <p className="mt-1 text-sm text-navy/50">{module.description}</p> : null}</header>
              <ol className="divide-y divide-navy/10">
                {module.lessons.map((lesson, lessonIndex) => <li key={lesson.id}><Link href={`/ultimate/courses/${course.slug}/${lesson.slug}`} className="group flex min-h-[72px] items-center gap-4 px-5 py-3 transition-colors hover:bg-ice/50 sm:px-6"><span className={`grid h-8 w-8 flex-none place-items-center rounded-full text-xs font-extrabold ${lesson.completed ? "bg-success text-white" : "bg-navy/7 text-navy/45"}`}>{lesson.completed ? "✓" : lessonIndex + 1}</span><span className="min-w-0 flex-1"><strong className="block text-sm text-navy">{lesson.title}</strong><span className="mt-1 block text-xs text-navy/40">{lesson.estimatedMinutes || 5} min{lesson.summary ? ` · ${lesson.summary}` : ""}</span></span><span className="text-brand transition-transform group-hover:translate-x-1">→</span></Link></li>)}
              </ol>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
