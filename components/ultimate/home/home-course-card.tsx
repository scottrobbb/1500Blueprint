import Link from "next/link";
import { LockedBadge } from "@/components/account/UpgradePrompt";
import { ChevronRightIcon } from "@/components/shell/icons";
import { HomeCourseThumbnail, HomeProgressBar } from "./course-thumbnail";
import { canAccessCourse, type StudentAccess } from "@/lib/auth/entitlements";
import { getCourseContinueHref, getHomeCourseCardLabel } from "@/lib/courses/navigation";
import type { Course } from "@/lib/courses/types";

export function HomeCourseCard({ course, access }: { course: Course; access: StudentAccess }) {
  const locked = !canAccessCourse(access, course.slug);
  const href = getCourseContinueHref(course, locked);
  const actionLabel = getHomeCourseCardLabel(locked, course.progress);

  return (
    <Link
      href={href}
      prefetch={false}
      className="group flex items-stretch gap-3.5 overflow-hidden rounded-[18px] border border-navy/10 bg-white p-3.5 transition-colors hover:border-brand/35 sm:gap-4 sm:p-4"
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        {locked ? (
          <div className="mb-1.5">
            <LockedBadge plan="max" />
          </div>
        ) : null}
        <h3 className="line-clamp-2 font-display text-base font-extrabold leading-snug text-ink sm:text-lg">{course.title}</h3>
        {!locked ? <HomeProgressBar value={course.progress} className="mt-2.5" /> : null}
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-navy/42">
          <span>
            {course.completedLessons}/{course.totalLessons} lessons
          </span>
          <span className="inline-flex items-center gap-1 text-brand-600">
            {actionLabel}
            <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
      <HomeCourseThumbnail course={course} variant="card" />
    </Link>
  );
}
