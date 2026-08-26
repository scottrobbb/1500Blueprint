import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunityIcon } from "@/components/community/icons";
import { LayersIcon } from "@/components/flashcards/icons";
import { ChevronRightIcon, DrillsIcon, FlameIcon, HistoryIcon, TestsIcon } from "@/components/shell/icons";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getLiveWeeklyCall } from "@/lib/calls/queries";
import type { WeeklyCall } from "@/lib/calls/types";
import { listCoursesForStudent } from "@/lib/courses/queries";
import type { Course } from "@/lib/courses/types";
import { loadHistory } from "@/lib/drills/progress";
import { listStudentLibrary } from "@/lib/flashcards/queries";
import { getHubState } from "@/lib/gamification/state";
import { canAccessCourse, getStudentAccess } from "@/lib/auth/entitlements";
import { PlanBadge } from "@/components/account/PlanBadge";
import { LockedAction, LockedBadge, LockIcon, UpgradePrompt } from "@/components/account/UpgradePrompt";
import { ProgressOverview } from "@/components/history/ProgressOverview";
import { getStudentProgress } from "@/lib/progress/queries";
import { withLessonProgress } from "@/lib/progress/summary";

export const metadata = { title: "Home" };

export default async function UltimateHomePage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [hub, history, flashcards, courses, access, savedProgress, liveCall, { billing }] = await Promise.all([
    getHubState(session.email),
    loadHistory(session.email),
    listStudentLibrary(session.email),
    listCoursesForStudent(session.email),
    getStudentAccess(session.email),
    getStudentProgress(session.email),
    getLiveWeeklyCall(),
    searchParams,
  ]);
  const availableCourses = courses.filter((course) => canAccessCourse(access, course.slug));
  const showLiveBanner = liveCall && access.entitlements.liveGroupClasses;
  const drillsLocked = access.entitlements.dailyDrillLimit === null;

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
  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 py-8 sm:px-8 sm:py-10">
      {showLiveBanner && liveCall ? <LiveCallBanner call={liveCall} /> : null}
      {billing === "success" ? (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" role="status">
          Your subscription is active. The new plan limits now apply.
        </div>
      ) : null}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-5 border-b border-navy/10 pb-7">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="text-xs font-semibold text-brand-600">Home</span><PlanBadge plan={access.plan} test={access.isTestAccount} /></div>
          <h1 className="font-display text-[32px] font-semibold tracking-[-0.04em] text-ink sm:text-[40px]">
            {isNewStudent ? `Welcome, ${hub.player.firstName}.` : `Welcome back, ${hub.player.firstName}.`}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-navy/58">
            {isNewStudent
              ? "Start with a lesson, answer a short practice set, then take a full test when you have a baseline."
              : "Continue your current lesson or start a focused practice session."}
          </p>
        </div>
        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-navy/12 bg-white px-4">
          <FlameIcon className="h-4 w-4 text-flag" />
          <span><strong className="block text-sm font-semibold leading-none text-navy">{hub.player.streak} day streak</strong><span className="mt-1 block text-[10px] text-navy/42">{hub.player.xp.toLocaleString()} XP</span></span>
        </div>
      </header>

      {access.plan === "free" ? (
        <UpgradePrompt
          currentPlan={access.plan}
          requiredPlan="core"
          title="Add daily practice and a second full test"
          description="Core adds 20 drills per day, Challenge questions, and another full test. Your current progress stays in place."
          features={["20 daily drills", "Challenge Question sets", "2 full-length tests"]}
          className="mb-7"
        />
      ) : access.plan === "core" ? (
        <UpgradePrompt
          currentPlan={access.plan}
          requiredPlan="max"
          title="Add a study plan, all courses, and weekly calls"
          description="Max adds the full course library, a schedule built from your results, and Scott's weekly group calls."
          features={["Personal study planner", "Every advanced course", "Weekly live calls"]}
          className="mb-7"
        />
      ) : null}

      <section className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.55fr)]">
        <div className="rounded-xl border border-navy/12 bg-white p-6 sm:p-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-brand-600">Continue learning</p>
              {activeCourse ? <span className="text-xs font-medium tabular-nums text-navy/45">{activeCourse.progress}% complete</span> : null}
            </div>
            <h2 className="mt-3 max-w-2xl font-display text-[26px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[30px]">
              {nextLesson?.title ?? activeCourse?.title ?? "Explore your available courses"}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-navy/58">
              {nextLesson?.summary ?? activeCourse?.description ?? "Open Courses to see Scott's lessons and begin with the first module."}
            </p>
            {activeCourse ? (
              <div className="mt-5 max-w-lg">
                <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-navy/45">
                  <span>{activeCourse.title}</span><span>{activeCourse.completedLessons} of {activeCourse.totalLessons} lessons</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-navy/[0.08]"><div className="h-full rounded-full bg-brand" style={{ width: `${activeCourse.progress}%` }} /></div>
              </div>
            ) : null}
            <Link href={nextCourseHref} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
              {nextLesson ? "Continue lesson" : activeCourse ? "Open course" : "Browse courses"} <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <aside className="rounded-xl border border-navy/12 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold text-brand-600">Today&apos;s practice</p><h2 className="mt-1 font-display text-xl font-semibold text-ink">{drillsLocked ? "Daily drills locked" : `${hub.dailyGoal.done} of ${hub.dailyGoal.total} drills`}</h2></div>
            {drillsLocked ? <LockIcon className="mt-1 h-5 w-5 text-[#7a5900]" /> : <span className="font-display text-2xl font-semibold tabular-nums text-navy">{dailyProgress}%</span>}
          </div>
          {drillsLocked ? <><p className="mt-3 text-xs leading-5 text-navy/52">Core includes 20 skill drills each day.</p><div className="mt-5"><LockedAction plan="core" label="See daily drills" /></div></> : <><div className="mt-5 h-2 overflow-hidden rounded-full bg-navy/[0.07]"><div className="h-full rounded-full bg-brand" style={{ width: `${dailyProgress}%` }} /></div><p className="mt-3 text-xs leading-5 text-navy/52">Complete a short set to keep your skill history current.</p><Link href="/ultimate/drills" className="mt-5 flex min-h-11 items-center justify-between rounded-lg border border-navy/12 px-4 text-sm font-semibold text-navy transition-colors hover:border-brand/35 hover:text-brand-600">Start a drill <ChevronRightIcon className="h-4 w-4" /></Link></>}
        </aside>
      </section>

      <ProgressOverview progress={progress} />

      <section className="mb-9">
        <div className="mb-3">
          <p className="text-xs font-semibold text-brand-600">Study sequence</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em] text-ink">Learn, practice, then measure</h2>
        </div>
        <div className="grid overflow-hidden rounded-xl border border-navy/12 bg-white md:grid-cols-3 md:divide-x md:divide-navy/10">
          <PathCard step="1" href="/ultimate/courses" title="Learn the method" detail={`${courses.length} ${courses.length === 1 ? "course" : "courses"} available · ${completedLessons}/${totalLessons} lessons complete`} Icon={BookIcon} />
          <PathCard step="2" href={drillsLocked ? "/pricing" : "/ultimate/drills"} title="Practice the skill" detail={drillsLocked ? "Daily drills unlock with Core" : `${history.length} unique drill questions · ${masteryRate}% mastered`} Icon={DrillsIcon} locked={drillsLocked} requiredPlan="core" />
          <PathCard step="3" href="/ultimate/tests" title="Measure your score" detail={progress.tests.bestScore ? `Best score ${progress.tests.bestScore} · ${progress.tests.count} tests complete` : "Take your first full-length practice test"} Icon={TestsIcon} />
        </div>
      </section>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><p className="text-xs font-semibold text-brand-600">Courses</p><h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em] text-ink">Available to you</h2></div>
            <Link href="/ultimate/courses" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-600 hover:text-navy">View all <ChevronRightIcon className="h-4 w-4" /></Link>
          </div>
          {courses.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {courses.slice(0, 4).map((course) => <CourseCard key={course.id} course={course} locked={!canAccessCourse(access, course.slug)} />)}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-navy/15 bg-white p-7 text-center"><h3 className="font-display text-lg font-semibold text-navy">No courses are published yet</h3><p className="mt-2 text-sm text-navy/50">Published courses will appear here.</p></div>
          )}
        </section>

        <aside>
          <div className="mb-3"><p className="text-xs font-semibold text-brand-600">Tools</p><h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.025em] text-ink">Other ways to study</h2></div>
          <div className="overflow-hidden rounded-xl border border-navy/12 bg-white">
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

function LiveCallBanner({ call }: { call: WeeklyCall }) {
  const content = (
    <>
      <span className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-red-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />Live now</span>
        <span className="text-sm font-bold">{call.title} is happening right now</span>
      </span>
      <span className="inline-flex items-center gap-1 text-sm font-extrabold">Join call <ChevronRightIcon className="h-4 w-4" /></span>
    </>
  );
  const className = "mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#8f2525] px-4 py-3 text-white transition-colors hover:bg-[#7f2020]";
  return call.meetingUrl
    ? <a href={call.meetingUrl} target="_blank" rel="noreferrer" className={className}>{content}</a>
    : <Link href="/ultimate/live-calls" className={className}>{content}</Link>;
}

function PathCard({ step, href, title, detail, Icon, locked = false, requiredPlan = "core" }: { step: string; href: string; title: string; detail: string; Icon: (props: { className?: string }) => React.ReactElement; locked?: boolean; requiredPlan?: "core" | "max" }) {
  return (
    <Link href={href} className="group relative flex min-h-[140px] flex-col p-5 transition-colors hover:bg-[#fafbfc] sm:p-6">
      <div className="flex items-center justify-between"><span className="grid h-7 w-7 place-items-center rounded-full border border-navy/15 text-xs font-semibold text-navy/55">{step}</span>{locked ? <LockedBadge plan={requiredPlan} /> : <Icon className="h-5 w-5 text-brand-600" />}</div>
      <strong className="mt-5 font-display text-lg font-semibold text-navy">{title}</strong>
      <span className="mt-1 text-xs leading-5 text-navy/52">{detail}</span>
      <ChevronRightIcon className="absolute bottom-5 right-5 h-4 w-4 text-navy/25 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </Link>
  );
}

function CourseCard({ course, locked }: { course: Course; locked: boolean }) {
  const nextLesson = course.modules.flatMap((module) => module.lessons).find((lesson) => !lesson.completed);
  const href = locked ? "/pricing" : nextLesson ? `/ultimate/courses/${course.slug}/${nextLesson.slug}` : `/ultimate/courses/${course.slug}`;
  return (
    <Link href={href} className="group rounded-xl border border-navy/12 bg-white p-5 transition-colors hover:border-brand/35">
      <div className="flex items-start justify-between gap-4"><BookIcon className="h-5 w-5 text-brand-600" />{locked ? <LockedBadge plan="max" /> : <span className="text-xs font-semibold tabular-nums text-navy/45">{course.progress}%</span>}</div>
      <p className="mt-4 text-xs font-medium text-brand-600">{course.eyebrow ?? "SAT course"}</p>
      <h3 className="mt-1 line-clamp-2 font-display text-lg font-semibold leading-tight text-ink">{course.title}</h3>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-navy/[0.07]"><div className="h-full rounded-full bg-brand" style={{ width: `${course.progress}%` }} /></div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-medium text-navy/48"><span>{course.completedLessons}/{course.totalLessons} lessons</span><span className="inline-flex items-center gap-1 font-semibold text-brand-600">{locked ? "See Max" : course.progress ? "Continue" : "Start"}<ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span></div>
    </Link>
  );
}

function ToolLink({ href, title, detail, Icon }: { href: string; title: string; detail: string; Icon: (props: { className?: string }) => React.ReactElement }) {
  return (
    <Link href={href} className="group flex min-h-[72px] items-center gap-3 border-b border-navy/10 px-4 last:border-b-0 hover:bg-[#fafbfc]">
      <Icon className="h-[18px] w-[18px] flex-none text-navy/55" />
      <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-navy">{title}</strong><span className="mt-0.5 block text-xs text-navy/48">{detail}</span></span>
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
