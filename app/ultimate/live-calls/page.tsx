import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessGate } from "@/components/account/AccessGate";
import { LocalCallTime } from "@/components/calls/LocalCallTime";
import { PageHeader } from "@/components/ultimate/PageHeader";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { googleCalendarTemplateUrl } from "@/lib/calls/google";
import { getPublishedWeeklyCallSchedule } from "@/lib/calls/queries";
import { getPublishedRecordingLibrary } from "@/lib/calls/recordings";
import type { CallRecordingMonth, WeeklyCall } from "@/lib/calls/types";

export const metadata = { title: "Weekly Calls" };
export const dynamic = "force-dynamic";

export default async function UltimateLiveCallsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const access = await getStudentAccess(session.email);
  if (!access.entitlements.liveGroupClasses) {
    return <AccessGate title="Join Scott's weekly calls" description="Weekly group classes and their recordings are included with Max." currentPlan={access.plan} />;
  }

  const [{ upcoming }, recordingMonths] = await Promise.all([
    getPublishedWeeklyCallSchedule(),
    getPublishedRecordingLibrary(),
  ]);
  const nextCall = upcoming[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-7 sm:py-10">
      <PageHeader eyebrow="Live with Scott" title="Weekly Calls" description="Bring the questions that slowed you down. Leave with a clear move for the next week." />
      {nextCall ? <NextCall call={nextCall} /> : <EmptySchedule />}

      <section className="mt-8">
        <div className="mb-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Coming up</p><h2 className="mt-1 font-display text-2xl font-extrabold text-ink">Your call schedule</h2></div>
        {upcoming.length ? <ol className="space-y-3">{upcoming.map((call, index) => <CallRow key={call.id} call={call} next={index === 0} />)}</ol> : <div className="rounded-[18px] border border-dashed border-navy/15 bg-white p-8 text-center text-sm text-navy/45">The next call will appear here as soon as Scott publishes it.</div>}
      </section>

      {recordingMonths.length ? (
        <section className="mt-8">
          <div className="mb-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">By month</p><h2 className="mt-1 font-display text-2xl font-extrabold text-ink">Recordings library</h2></div>
          <div className="space-y-6">
            {recordingMonths.map((month) => <RecordingMonthSection key={month.id} month={month} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RecordingMonthSection({ month }: { month: CallRecordingMonth }) {
  return (
    <div>
      <h3 className="mb-3 font-display text-lg font-extrabold text-navy">{month.label}</h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {month.lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link href={`/ultimate/live-calls/recordings/${lesson.id}`} className="group flex items-center gap-3 rounded-[16px] border border-navy/10 bg-white p-4 shadow-pop transition-colors hover:border-brand/35">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-navy text-white"><PlayIcon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><strong className="line-clamp-2 block text-sm text-navy">{lesson.title || formatRecordingDate(lesson.callDate)}</strong><span className="mt-1 block text-[11px] text-navy/40">{lesson.title ? formatRecordingDate(lesson.callDate) + " · " : ""}Watch recording</span></span>
              <span className="flex-none text-brand-600 transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NextCall({ call }: { call: WeeklyCall }) {
  const joinable = Boolean(call.meetingUrl);
  return (
    <section className="relative mt-7 overflow-hidden rounded-[22px] bg-[linear-gradient(125deg,#0b2a5b_0%,#164b87_64%,#248fd1_100%)] text-white shadow-[0_22px_60px_-38px_rgba(11,42,91,0.95)]">
      <div aria-hidden="true" className="absolute -right-24 -top-32 h-96 w-96 rounded-full border-[54px] border-sky/[0.09]" />
      <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center lg:p-10">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-gold px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-navy">Next live call</span><span className="text-xs font-semibold text-white/55">Hosted by {call.hostName}</span></div>
          <h2 className="mt-4 max-w-3xl font-display text-[31px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[40px]">{call.title}</h2>
          {call.focusTopic ? <p className="mt-2 text-sm font-bold text-sky">Focus: {call.focusTopic}</p> : null}
          {call.description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">{call.description}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            {joinable ? <a href={call.meetingUrl as string} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-[0_2px_0_#1879c4] hover:bg-[#50b5fb]"><VideoIcon className="h-4 w-4" /> Join call</a> : <span className="inline-flex min-h-11 items-center rounded-xl bg-white/10 px-5 text-sm font-bold text-white/60">Meet link publishes before the call</span>}
            <a href={googleCalendarTemplateUrl(call)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-5 text-sm font-bold text-white hover:bg-white/[0.14]"><CalendarIcon className="h-4 w-4" /> Add to Google Calendar</a>
          </div>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-white/[0.08] p-5 backdrop-blur-sm">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-sky">When</p>
          <strong className="mt-2 block font-display text-2xl font-extrabold">{formatDate(call.startsAt, call.timezone)}</strong>
          <span className="mt-1 block text-sm font-semibold text-white/65">{formatTime(call.startsAt, call.timezone)}–{formatTime(call.endsAt, call.timezone)} {zoneAbbreviation(call.startsAt, call.timezone)}</span>
          <LocalCallTime startsAt={call.startsAt} endsAt={call.endsAt} sourceTimeZone={call.timezone} className="mt-1 block text-sm font-semibold text-sky" />
          <div className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-white/48">Google Calendar will preserve the exact event time.</div>
        </div>
      </div>
    </section>
  );
}

function CallRow({ call, next }: { call: WeeklyCall; next: boolean }) {
  return (
    <li className={`grid gap-4 rounded-[18px] border bg-white p-4 shadow-pop sm:grid-cols-[90px_minmax(0,1fr)_auto] sm:items-center sm:p-5 ${next ? "border-brand/30" : "border-navy/10"}`}>
      <div className="rounded-xl bg-haze/70 px-3 py-2.5 text-center"><span className="block text-[10px] font-extrabold uppercase tracking-wide text-brand-600">{new Date(call.startsAt).toLocaleDateString("en-US", { month: "short", timeZone: call.timezone })}</span><strong className="font-display text-2xl font-extrabold text-navy">{new Date(call.startsAt).toLocaleDateString("en-US", { day: "numeric", timeZone: call.timezone })}</strong></div>
      <div className="min-w-0"><div className="flex items-center gap-2">{next ? <span className="h-2 w-2 rounded-full bg-success" /> : null}<h3 className="truncate font-display text-base font-extrabold text-navy">{call.title}</h3></div><p className="mt-1 text-xs text-navy/45">{formatTime(call.startsAt, call.timezone)}–{formatTime(call.endsAt, call.timezone)} {zoneAbbreviation(call.startsAt, call.timezone)} · {call.hostName}</p><LocalCallTime startsAt={call.startsAt} endsAt={call.endsAt} sourceTimeZone={call.timezone} className="mt-0.5 block text-xs font-semibold text-brand-600" />{call.focusTopic ? <p className="mt-1 line-clamp-1 text-xs font-semibold text-brand-700">{call.focusTopic}</p> : null}</div>
      <div className="flex gap-2"><a href={googleCalendarTemplateUrl(call)} target="_blank" rel="noreferrer" aria-label={`Add ${call.title} to Google Calendar`} className="grid h-11 w-11 place-items-center rounded-xl border border-navy/10 text-navy hover:border-brand/35 hover:text-brand-600"><CalendarIcon className="h-5 w-5" /></a>{call.meetingUrl ? <a href={call.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 text-sm font-extrabold text-white hover:bg-brand-600">Join</a> : null}</div>
    </li>
  );
}

function EmptySchedule() { return <section className="mt-7 rounded-[20px] border border-dashed border-brand/30 bg-ice/45 p-8 text-center sm:p-10"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-brand-600 shadow-sm"><CalendarIcon className="h-7 w-7" /></span><h2 className="mt-4 font-display text-2xl font-extrabold text-navy">The next call is being scheduled.</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-navy/50">You will see the date, Google Calendar link, and Meet room here as soon as Scott publishes it.</p><Link href="/ultimate/community" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 text-sm font-extrabold text-white">Ask in the community</Link></section>; }

function formatDate(value: string, timeZone: string): string { return new Date(value).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }); }
function formatTime(value: string, timeZone: string): string { return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }); }
function zoneAbbreviation(value: string, timeZone: string): string {
  const parts = new Date(value).toLocaleTimeString("en-US", { timeZoneName: "short", timeZone }).split(" ");
  return parts[parts.length - 1];
}
function formatRecordingDate(value: string): string { return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }
function CalendarIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h2M14 14h2" strokeLinecap="round" /></svg>; }
function VideoIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" strokeLinejoin="round" /></svg>; }
function PlayIcon({ className }: { className?: string }) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="m9 7 9 5-9 5V7Z" /></svg>; }
