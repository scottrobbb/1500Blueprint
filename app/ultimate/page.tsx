import { notFound } from "next/navigation";
import { FlameIcon } from "@/components/shell/icons";
import { ProgressOverview } from "@/components/history/ProgressOverview";
import { AvailableCoursesSection, CurrentCourseSection, HomeDrillsPanel } from "@/components/ultimate/home/home-sections";
import { HomeQuickLinks } from "@/components/ultimate/home/home-quick-links";
import { HomeUpgradePrompts } from "@/components/ultimate/home/home-upgrade-prompts";
import { LiveCallBanner } from "@/components/ultimate/home/live-call-banner";
import { canAccessCourse, getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getLiveWeeklyCall } from "@/lib/calls/queries";
import { findActiveCourse, findNextIncompleteLesson, sumLessonProgress } from "@/lib/courses/navigation";
import { listCoursesForStudent } from "@/lib/courses/queries";
import { getHubState } from "@/lib/gamification/state";
import { getStudentProgress } from "@/lib/progress/queries";
import type { StudentProgress } from "@/lib/progress/types";
import { withLessonProgress } from "@/lib/progress/summary";

export const metadata = { title: "Home" };

type UltimateHomePageProps = {
  searchParams: Promise<{ billing?: string }>;
};

export default async function UltimateHomePage({ searchParams }: UltimateHomePageProps) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();

  const [hub, courses, access, savedProgress, liveCall, { billing }] = await Promise.all([
    getHubState(session.email),
    listCoursesForStudent(session.email),
    getStudentAccess(session.email),
    getStudentProgress(session.email),
    getLiveWeeklyCall(),
    searchParams,
  ]);

  const availableCourses = courses.filter((course) => canAccessCourse(access, course.slug));
  const lessonTotals = sumLessonProgress(availableCourses);
  const progress = withLessonProgress(savedProgress, lessonTotals);
  const activeCourse = findActiveCourse(availableCourses);
  const nextLesson = activeCourse ? (findNextIncompleteLesson(activeCourse) ?? null) : null;
  const showLiveBanner = liveCall && access.entitlements.liveGroupClasses;
  const drillsLocked = access.entitlements.dailyDrillLimit === null;
  const isNewStudent = hasNoPracticeHistory(progress, lessonTotals.completed);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-7 sm:py-9">
      {showLiveBanner && liveCall ? <LiveCallBanner call={liveCall} /> : null}

      {billing === "success" ? (
        <div
          className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          Your subscription is active. Your new plan access is ready.
        </div>
      ) : null}

      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[31px] font-extrabold tracking-[-0.04em] text-ink sm:text-[40px]">
            {isNewStudent ? `Welcome, ${hub.player.firstName}.` : `Welcome back, ${hub.player.firstName}.`}
          </h1>
        </div>
        <div
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-navy/10 bg-white px-3"
          aria-label={`${hub.player.streak} day streak`}
        >
          <FlameIcon className="h-[17px] w-[17px] text-flag" />
          <strong className="font-display text-lg font-extrabold tabular-nums leading-none text-navy">{hub.player.streak}</strong>
        </div>
      </header>

      <HomeUpgradePrompts plan={access.plan} />

      <CurrentCourseSection activeCourse={activeCourse} nextLesson={nextLesson} />

      <section className="mb-7 grid gap-4 md:grid-cols-2 md:items-stretch">
        <HomeDrillsPanel locked={drillsLocked} dailyGoal={hub.dailyGoal} />
        <HomeQuickLinks />
      </section>

      {!isNewStudent ? <ProgressOverview progress={progress} /> : null}

      <div className="grid items-start gap-7">
        <AvailableCoursesSection courses={courses} access={access} />
      </div>
    </div>
  );
}

function hasNoPracticeHistory(progress: StudentProgress, completedLessons: number): boolean {
  return (
    progress.questions.attempted === 0
    && progress.tests.count === 0
    && progress.drills.sessions === 0
    && progress.drills.uniqueQuestions === 0
    && completedLessons === 0
  );
}
