import { CourseCover } from "@/components/ultimate/courses/CourseCover";
import type { Course } from "@/lib/courses/types";

const THUMB_VARIANTS = {
  hero: "h-28 w-36 sm:h-32 sm:w-40",
  card: "h-[5.25rem] w-[6.5rem] sm:h-24 sm:w-28",
} as const;

type HomeCourseThumbnailProps = {
  course: Pick<Course, "coverUrl" | "title" | "eyebrow" | "coverZoom">;
  variant?: keyof typeof THUMB_VARIANTS;
  priority?: boolean;
};

export function HomeCourseThumbnail({ course, variant = "card", priority = false }: HomeCourseThumbnailProps) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[14px] border border-navy/10 bg-haze ${THUMB_VARIANTS[variant]}`}
    >
      <CourseCover
        src={course.coverUrl}
        title={course.title}
        eyebrow={course.eyebrow}
        zoom={course.coverZoom}
        priority={priority}
        fill
        className="h-full w-full"
      />
    </div>
  );
}

export function HomeProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-navy/[0.07]">
        <div className="h-full rounded-full bg-brand" style={{ width: `${value}%` }} />
      </div>
      <span className="shrink-0 text-xs font-bold tabular-nums text-navy/45">{value}%</span>
    </div>
  );
}
