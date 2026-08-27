import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessGate } from "@/components/account/AccessGate";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { getPublishedRecordingLesson } from "@/lib/calls/recordings";
import { vimeoEmbedUrl } from "@/lib/calls/vimeo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function RecordingPlayerPage({ params }: Params) {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const access = await getStudentAccess(session.email);
  if (!access.entitlements.liveGroupClasses) {
    return <AccessGate title="Join Scott's weekly calls" description="Weekly group classes and their recordings are included with Max." currentPlan={access.plan} />;
  }

  const { id } = await params;
  const lesson = await getPublishedRecordingLesson(id);
  if (!lesson) notFound();
  const embedUrl = vimeoEmbedUrl(lesson.vimeoUrl);
  const heading = lesson.title || formatRecordingDate(lesson.callDate);

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-7 sm:px-7 sm:py-10">
      <Link href="/ultimate/live-calls" className="inline-flex items-center gap-1.5 text-xs font-extrabold text-brand-700 hover:text-navy">← Back to Weekly Calls</Link>
      <h1 className="mt-3 font-display text-2xl font-extrabold text-ink sm:text-3xl">{heading}</h1>
      <p className="mt-1 text-sm font-semibold text-navy/45">{formatRecordingDate(lesson.callDate)}</p>

      <div className="mt-5 overflow-hidden rounded-[18px] border border-navy/10 bg-black shadow-pop">
        {embedUrl ? (
          <div className="relative aspect-video w-full">
            <iframe
              src={embedUrl}
              title={heading}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-fullscreen"
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center px-6 text-center text-sm text-white/60">
            This recording link couldn&rsquo;t be embedded. Contact Scott if this keeps happening.
          </div>
        )}
      </div>
    </div>
  );
}

function formatRecordingDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
