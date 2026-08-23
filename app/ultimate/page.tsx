import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunityIcon } from "@/components/community/icons";
import { LayersIcon } from "@/components/flashcards/icons";
import { ChevronRightIcon, DrillsIcon, FlameIcon, HistoryIcon, TestsIcon } from "@/components/shell/icons";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { listCoursesForStudent } from "@/lib/courses/queries";
import type { Course } from "@/lib/courses/types";
import { loadHistory } from "@/lib/drills/progress";
import { listStudentLibrary } from "@/lib/flashcards/queries";
import { getHubState } from "@/lib/gamification/state";
import { canAccessCourse, getStudentAccess } from "@/lib/auth/entitlements";
import { PlanBadge } from "@/components/account/PlanBadge";
import { ProgressOverview } from "@/components/history/ProgressOverview";
import { getStudentProgress } from "@/lib/progress/queries";
import { withLessonProgress } from "@/lib/progress/summary";

export const metadata = { title: "Home" };

export default async function UltimateHomePage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [hub, history, flashcards, courses, access, savedProgress] = await Promise.all([
    getHubState(session.email),
    loadHistory(session.email),
    listStudentLibrary(session.email),
    listCoursesForStudent(session.email),
    getStudentAccess(session.email),
    getStudentProgress(session.email),
  ]);
  const availableCourses = courses.filter((course) => canAccessCourse(access, course.slug));

  const mastered = history.filter((entry) => entry.mastered).length;
  const masteryRate = history.length > 0 ? Math.round((mastered / history.length) * 100) : 0;
  const dailyProgress = Math.min(100, Math.round((hub.dailyGoal.done / Math.max(1, hub.dailyGoal.total)) * 100));
  const cardCount = [...flashcards.owned, ...flashcards.shared].reduce((sum, set) => sum + set.cardCount, 0);
  const totalLessons = availableCourses.reduce((sum, course) => sum + course.totalLessons, 0);
  const completedLessons = availableCourses.reduce((sum, course) => sum + course.completedLessons, 0);
  const progress = withLessonProgress(savedProgress, { completed: completedLessons, total: totalLessons });
  const activeCourse = availableCourses.find((course) => course.progress < 100) ?? availableCourses[0] ?? null;
  const nextLesson = activeCourse?.modules.flatMap((module) => module.lessons).find((lesson) => !lesson.completed) ?? null;
  const nextCourseHref = activeCourse
    ? nextLesson
      ? `/ultimate/courses/${activeCourse.slug}/${nextLesson.slug}`
      : `/ultimate/courses/${activeCourse.slug}`
    : "/ultimate/courses";
  const isNewStudent = progress.questions.attempted === 0
    && progress.tests.count === 0
    && progress.drills.sessions === 0
    && progress.drills.uniqueQuestions === 0
    && completedLessons === 0;
  const { billing } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-7 sm:py-9">
      {billing === "success" ? (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">
          Your subscription is active. Your new plan access is ready.
        </div>
      ) : null}
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3"><PlanBadge plan={access.plan} test={access.isTestAccount} /></div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-600">
            {isNewStudent ? "Your SAT workspace" : "Your blueprint today"}
          </p>
          <h1 className="mt-1 font-display text-[31px] font-extrabold tracking-[-0.04em] text-ink sm:text-[40px]">
            {isNewStudent ? `Welcome, ${hub.player.firstName}.` : `Welcome back, ${hub.player.firstName}.`}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-navy/52">
            {isNewStudent
              ? "Start with a lesson, practice what you learned, then use a full test to measure your progress."
              : "Keep moving through your course, practice weak skills, and use full tests to measure the result."}
          </p>
        </div>
        <div className="flex min-h-11 items-center gap-3 rounded-xl border border-navy/10 bg-white px-4 shadow-[0_1px_2px_rgba(11,42,91,0.04)]">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#fff6dc] text-flag"><FlameIcon className="h-[18px] w-[18px]" /></span>
          <span><strong className="block font-display text-sm leading-none text-navy">{hub.player.streak} day streak</strong><span className="mt-1 block text-[10px] text-navy/40">Keep showing up</span></span>
        </div>
      </header>

      <section className="mb-7 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.55fr)]">
        <div className="relative overflow-hidden rounded-[20px] bg-navy p-6 text-white shadow-[0_18px_48px_-30px_rgba(11,42,91,0.8)] sm:p-8">
          <div aria-hidden="true" className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[40px] border-sky/[0.08]" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky">Your next move</p>
              {activeCourse ? <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-white/65">{activeCourse.progress}% complete</span> : null}
            </div>
            <h2 className="mt-4 max-w-2xl font-display text-[27px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[34px]">
              {nextLesson?.title ?? activeCourse?.title ?? "Explore your available courses"}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/62">
              {nextLesson?.summary ?? activeCourse?.description ?? "Open Courses to see Scott's lessons and begin with the first module."}
            </p>
            {activeCourse ? (
              <div className="mt-5 max-w-lg">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-white/50">
                  <span>{activeCourse.title}</span><span>{activeCourse.completedLessons} of {activeCourse.totalLessons} lessons</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/12"><div className="h-full rounded-full bg-sky" style={{ width: `${activeCourse.progress}%` }} /></div>
              </div>
            ) : null}
            <Link href={nextCourseHref} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-[0_2px_0_#2b8fe0] transition-colors hover:bg-[#50b5fb]">
              {nextLesson ? "Continue lesson" : activeCourse ? "Open course" : "Browse courses"} <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <aside className="rounded-[20px] border border-navy/10 bg-white p-5 shadow-[0_1px_3px_rgba(11,42,91,0.04)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Today&apos;s practice</p><h2 className="mt-1 font-display text-xl font-extrabold text-ink">{hub.dailyGoal.done} of {hub.dailyGoal.total} drills</h2></div>
            <span className="font-display text-2xl font-extrabold text-navy">{dailyProgress}%</span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-navy/[0.07]"><div className="h-full rounded-full bg-brand" style={{ width: `${dailyProgress}%` }} /></div>
          <p className="mt-3 text-xs leading-5 text-navy/45">A short focused session keeps your skill history and recommendations current.</p>
          <Link href="/ultimate/drills" className="mt-5 flex min-h-11 items-center justify-between rounded-xl bg-[#eaf6ff] px-4 text-sm font-extrabold text-navy transition-colors hover:bg-[#dcefff]">
            Start a drill <span className="flex items-center gap-2 text-xs text-brand-600">Practice <ChevronRightIcon className="h-4 w-4" /></span>
          </Link>
        </aside>
      </section>

      <ProgressOverview progress={progress} />

      <section className="mb-8">
        <div className="mb-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand-600">How to use the platform</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Learn, practice, then measure.</h2>
        </div>
        <div className="grid overflow-hidden rounded-[20px] border border-navy/10 bg-white shadow-[0_1px_3px_rgba(11,42,91,0.04)] md:grid-cols-3 md:divide-x md:divide-navy/10">
          <PathCard step="1" href="/ultimate/courses" title="Learn the method" detail={`${courses.length} ${courses.length === 1 ? "course" : "courses"} available · ${completedLessons}/${totalLessons} lessons complete`} Icon={BookIcon} />
          <PathCard step="2" href="/ultimate/drills" title="Practice the skill" detail={`${history.length} unique drill questions · ${masteryRate}% mastered`} Icon={DrillsIcon} />
          <PathCard step="3" href="/ultimate/tests" title="Measure your score" detail={progress.tests.bestScore ? `Best score ${progress.tests.bestScore} · ${progress.tests.count} tests complete` : "Take your first full-length practice test"} Icon={TestsIcon} />
        </div>
      </section>

      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand-600">Your content</p><h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Available courses</h2></div>
            <Link href="/ultimate/courses" className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-brand-600 hover:text-navy">View all <ChevronRightIcon className="h-4 w-4" /></Link>
          </div>
          {courses.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {courses.slice(0, 4).map((course) => <CourseCard key={course.id} course={course} />)}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-navy/15 bg-white p-7 text-center"><h3 className="font-display text-lg font-extrabold text-navy">Courses are being prepared</h3><p className="mt-2 text-sm text-navy/45">Published course content will appear here automatically.</p></div>
          )}
        </section>

        <aside>
          <div className="mb-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand-600">More tools</p><h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Study your way</h2></div>
          <div className="overflow-hidden rounded-[18px] border border-navy/10 bg-white shadow-[0_1px_3px_rgba(11,42,91,0.04)]">
            <ToolLink href="/ultimate/bank" title="Question Bank" detail="Practice by SAT skill" Icon={QuestionBankIcon} />
            <ToolLink href="/ultimate/flashcards" title="Flashcards" detail={`${cardCount} cards in your library`} Icon={LayersIcon} />
            <ToolLink href="/ultimate/history" title="Practice history" detail="Review answers and mastery" Icon={HistoryIcon} />
            <ToolLink href="/ultimate/community" title="Community" detail="Ask questions and share wins" Icon={CommunityIcon} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function PathCard({ step, href, title, detail, Icon }: { step: string; href: string; title: string; detail: string; Icon: (props: { className?: string }) => React.ReactElement }) {
  return (
    <Link href={href} className="group relative flex min-h-[150px] flex-col p-5 transition-colors hover:bg-[#f8fbfe] sm:p-6">
      <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-navy/30">Step {step}</span><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf6ff] text-brand-600"><Icon className="h-5 w-5" /></span></div>
      <strong className="mt-5 font-display text-lg font-extrabold text-navy">{title}</strong>
      <span className="mt-1 text-xs leading-5 text-navy/45">{detail}</span>
      <ChevronRightIcon className="absolute bottom-5 right-5 h-4 w-4 text-navy/25 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </Link>
  );
}

function CourseCard({ course }: { course: Course }) {
  const nextLesson = course.modules.flatMap((module) => module.lessons).find((lesson) => !lesson.completed);
  const href = nextLesson ? `/ultimate/courses/${course.slug}/${nextLesson.slug}` : `/ultimate/courses/${course.slug}`;
  return (
    <Link href={href} className="group rounded-[18px] border border-navy/10 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[0_12px_30px_-24px_rgba(11,42,91,0.5)] motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-navy text-white"><BookIcon className="h-5 w-5" /></span><span className="text-xs font-extrabold tabular-nums text-navy/40">{course.progress}%</span></div>
      <p className="mt-4 text-[9px] font-extrabold uppercase tracking-[0.15em] text-brand-600">{course.eyebrow ?? "1500 Blueprint course"}</p>
      <h3 className="mt-1 line-clamp-2 font-display text-lg font-extrabold leading-tight text-ink">{course.title}</h3>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-navy/[0.07]"><div className="h-full rounded-full bg-brand" style={{ width: `${course.progress}%` }} /></div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-semibold text-navy/42"><span>{course.completedLessons}/{course.totalLessons} lessons</span><span className="inline-flex items-center gap-1 text-brand-600">{course.progress ? "Continue" : "Start"}<ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span></div>
    </Link>
  );
}

function ToolLink({ href, title, detail, Icon }: { href: string; title: string; detail: string; Icon: (props: { className?: string }) => React.ReactElement }) {
  return (
    <Link href={href} className="group flex min-h-[76px] items-center gap-3 border-b border-navy/10 px-4 last:border-b-0 hover:bg-[#f8fbfe]">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-haze text-navy/65"><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1"><strong className="block font-display text-sm text-navy">{title}</strong><span className="mt-0.5 block text-xs text-navy/42">{detail}</span></span>
      <ChevronRightIcon className="h-4 w-4 text-navy/20 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </Link>
  );
}

function BookIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" strokeLinejoin="round" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20M8 7h8M8 10.5h6" strokeLinecap="round" /></svg>;
}

function QuestionBankIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3.5" y="4" width="17" height="14" rx="2.5" /><path d="M8 20h8M12 18v2M8.5 9.2h7M8.5 12.8h4.5" strokeLinecap="round" /></svg>;
}
