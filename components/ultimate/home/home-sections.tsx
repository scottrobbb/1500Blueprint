import Link from "next/link";
import { LockedAction } from "@/components/account/UpgradePrompt";
import { ChevronRightIcon } from "@/components/shell/icons";
import { HomeCourseThumbnail, HomeProgressBar } from "./course-thumbnail";
import type { StudentAccess } from "@/lib/auth/entitlements";
import { getContinueCourseHref, getContinueCourseLabel } from "@/lib/courses/navigation";
import type { Course, CourseLesson } from "@/lib/courses/types";
import { HomeCourseCard } from "./home-course-card";

export function CurrentCourseSection({
  activeCourse,
  nextLesson,
}: {
  activeCourse: Course | null;
  nextLesson: CourseLesson | null;
}) {
  const continueHref = getContinueCourseHref(activeCourse);
  const continueLabel = getContinueCourseLabel(Boolean(nextLesson), Boolean(activeCourse));
  const heading = nextLesson?.title ?? activeCourse?.title ?? "Explore your available courses";

  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Current course</h2>
      </div>
      <section className="mb-7 rounded-[20px] border border-navy/10 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
            {activeCourse ? <HomeCourseThumbnail course={activeCourse} variant="hero" priority /> : null}

            <div className="min-w-0 flex-1">
              {activeCourse ? (
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">{activeCourse.title}</p>
              ) : null}
              <h3 className="mt-1 font-display text-2xl font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-[28px]">
                {heading}
              </h3>

              {activeCourse ? (
                <div className="mt-3">
                  <HomeProgressBar value={activeCourse.progress} />
                  <p className="mt-1.5 text-[11px] font-semibold leading-none text-navy/45">
                    {activeCourse.completedLessons} of {activeCourse.totalLessons} lessons
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <Link
            href={continueHref}
            prefetch={false}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-xl bg-navy px-5 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 sm:self-center"
          >
            {continueLabel}
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

function getDailyProgressPercent(done: number, total: number): number {
  return Math.min(100, Math.round((done / Math.max(1, total)) * 100));
}

export function HomeDrillsPanel({
  locked,
  dailyGoal,
}: {
  locked: boolean;
  dailyGoal: { done: number; total: number };
}) {
  const dailyProgress = getDailyProgressPercent(dailyGoal.done, dailyGoal.total);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3">
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Drills</h2>
      </div>
      <aside className="flex flex-1 flex-col rounded-[20px] border border-navy/10 bg-white p-5 sm:p-6">
        {locked ? (
          <>
            <p className="text-xs leading-5 text-navy/45">
              Max adds focused daily drills and tracks which SAT patterns are becoming automatic.
            </p>
            <div className="mt-4">
              <LockedAction plan="max" label="Unlock daily drills" />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-navy/55">
              <span>Today&apos;s goal</span>
              <span className="tabular-nums text-navy/45">
                {dailyGoal.done} of {dailyGoal.total} drills
              </span>
            </div>
            <div
              className="mt-2.5"
              role="progressbar"
              aria-label="Today's drill goal"
              aria-valuemin={0}
              aria-valuemax={dailyGoal.total}
              aria-valuenow={Math.min(dailyGoal.done, dailyGoal.total)}
            >
              <HomeProgressBar value={dailyProgress} />
            </div>
            <Link
              href="/ultimate/drills"
              className="mt-auto flex min-h-11 items-center justify-between rounded-xl border border-navy/10 bg-haze px-4 text-sm font-extrabold text-navy transition-colors hover:bg-navy/[0.04]"
            >
              Start a drill
              <span className="flex items-center gap-2 text-xs text-brand-600">
                Practice
                <ChevronRightIcon className="h-4 w-4" />
              </span>
            </Link>
          </>
        )}
      </aside>
    </div>
  );
}

export function AvailableCoursesSection({ courses, access }: { courses: Course[]; access: StudentAccess }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-ink">Available courses</h2>
        <Link href="/ultimate/courses" className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-brand-600 hover:text-navy">
          View all
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </div>
      {courses.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {courses.slice(0, 4).map((course) => (
            <HomeCourseCard key={course.id} course={course} access={access} />
          ))}
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-navy/15 bg-white p-7 text-center">
          <h3 className="font-display text-lg font-extrabold text-navy">Courses are being prepared</h3>
          <p className="mt-2 text-sm text-navy/45">Published course content will appear here automatically.</p>
        </div>
      )}
    </section>
  );
}
