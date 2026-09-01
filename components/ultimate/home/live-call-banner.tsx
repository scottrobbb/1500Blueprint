import Link from "next/link";
import { ChevronRightIcon } from "@/components/shell/icons";
import type { WeeklyCall } from "@/lib/calls/types";

const bannerClassName =
  "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[linear-gradient(110deg,#7a1414_0%,#b8261f_60%,#e0432b_100%)] px-4 py-3 text-white shadow-[0_10px_28px_-16px_rgba(184,38,31,0.7)] transition-opacity hover:opacity-95";

export function LiveCallBanner({ call }: { call: WeeklyCall }) {
  const content = (
    <>
      <span className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-red-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
          Live now
        </span>
        <span className="text-sm font-bold">{call.title} is happening right now</span>
      </span>
      <span className="inline-flex items-center gap-1 text-sm font-extrabold">
        Join call
        <ChevronRightIcon className="h-4 w-4" />
      </span>
    </>
  );

  if (call.meetingUrl) {
    return (
      <a href={call.meetingUrl} target="_blank" rel="noreferrer" className={bannerClassName}>
        {content}
      </a>
    );
  }

  return (
    <Link href="/ultimate/live-calls" className={bannerClassName}>
      {content}
    </Link>
  );
}
