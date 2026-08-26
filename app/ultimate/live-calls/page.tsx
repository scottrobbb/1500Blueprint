import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessGate } from "@/components/account/AccessGate";
import { LocalCallTime } from "@/components/calls/LocalCallTime";
import { PageHeader } from "@/components/ultimate/PageHeader";
import { getStudentAccess } from "@/lib/auth/entitlements";
import { getSession } from "@/lib/auth/session";
import { isUltimatePreviewEmail } from "@/lib/auth/ultimate";
import { googleCalendarTemplateUrl } from "@/lib/calls/google";
import { getPublishedWeeklyCallSchedule, isCallLiveNow } from "@/lib/calls/queries";
import { getPublishedRecordingLibrary } from "@/lib/calls/recordings";
import type { CallRecordingMonth, WeeklyCall } from "@/lib/calls/types";

export const metadata = { title: "Weekly Calls" };
export const dynamic = "force-dynamic";

export default async function UltimateLiveCallsPage() {
  const session = await getSession();
  if (!session || !isUltimatePreviewEmail(session.email)) notFound();
  const access = await getStudentAccess(session.email);
  if (!access.entitlements.liveGroupClasses) {
    return <AccessGate title="Weekly calls are included with Max" description="Max includes Scott's weekly group sessions and the recording library." currentPlan={access.plan} />;
  }

  const [{ upcoming }, recordingMonths] = await Promise.all([
    getPublishedWeeklyCallSchedule(),
    getPublishedRecordingLibrary(),
  ]);
  const nextCall = upcoming[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-7 sm:py-10">
      <PageHeader eyebrow="Live with Scott" title="Weekly Calls" description="Join Scott's weekly group sessions or watch a recording when you miss one." />
      {nextCall ? <NextCall call={nextCall} /> : <EmptySchedule />}

      <section className="mt-8">
        <div className="mb-4"><p className="text-xs font-semibold text-brand-600">Coming up</p><h2 className="mt-1 font-display text-2xl font-semibold text-ink">Call schedule</h2></div>
        {upcoming.length ? <ol className="space-y-3">{upcoming.map((call, index) => <CallRow key={call.id} call={call} next={index === 0} />)}</ol> : <div className="rounded-xl border border-dashed border-navy/15 bg-white p-8 text-center text-sm text-navy/50">Scott has not published the next call yet.</div>}
      </section>

      {recordingMonths.length ? (
        <section className="mt-8">
          <div className="mb-4"><p className="text-xs font-semibold text-brand-600">Past calls</p><h2 className="mt-1 font-display text-2xl font-semibold text-ink">Recordings</h2></div>
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
      <h3 className="mb-3 font-display text-lg font-semibold text-navy">{month.label}</h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {month.lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link href={`/ultimate/live-calls/recordings/${lesson.id}`} className="group flex items-center gap-3 rounded-xl border border-navy/12 bg-white p-4 transition-colors hover:border-brand/35">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-navy/10 bg-haze text-navy"><PlayIcon className="h-4 w-4" /></span>
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
  const live = isCallLiveNow(call);
  return (
    <section className={`mt-7 overflow-hidden rounded-xl border bg-white ${live ? "border-red-300" : "border-navy/12"}`}>
      <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />Live now</span>
            ) : (
              <span className="rounded-full border border-brand/20 bg-ice px-3 py-1 text-[10px] font-semibold text-brand-700">Next call</span>
            )}
            <span className="text-xs font-medium text-navy/45">Hosted by {call.hostName}</span>
          </div>
          <h2 className="mt-4 max-w-3xl font-display text-[30px] font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[36px]">{call.title}</h2>
          {call.focusTopic ? <p className="mt-2 text-sm font-semibold text-brand-600">Focus: {call.focusTopic}</p> : null}
          {call.description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-navy/58">{call.description}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            {joinable ? <a href={call.meetingUrl as string} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy px-5 text-sm font-semibold text-white hover:bg-brand-600"><VideoIcon className="h-4 w-4" /> {live ? "Join now" : "Join call"}</a> : <span className="inline-flex min-h-11 items-center rounded-lg bg-haze px-5 text-sm font-medium text-navy/50">Meet link publishes before the call</span>}
            <a href={googleCalendarTemplateUrl(call)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-navy/15 px-5 text-sm font-semibold text-navy hover:border-brand/35 hover:text-brand-600"><CalendarIcon className="h-4 w-4" /> Add to Google Calendar</a>
          </div>
        </div>
        <div className="rounded-lg border border-navy/10 bg-haze/70 p-5">
          <p className="text-xs font-semibold text-brand-600">When</p>
          <strong className="mt-2 block font-display text-2xl font-semibold text-ink">{formatDate(call.startsAt, call.timezone)}</strong>
          <span className="mt-1 block text-sm font-medium text-navy/58">{formatTime(call.startsAt, call.timezone)}–{formatTime(call.endsAt, call.timezone)} {zoneAbbreviation(call.startsAt, call.timezone)}</span>
          <LocalCallTime startsAt={call.startsAt} endsAt={call.endsAt} sourceTimeZone={call.timezone} className="mt-1 block text-sm font-semibold text-brand-600" />
          <div className="mt-5 border-t border-navy/10 pt-4 text-xs leading-5 text-navy/48">Google Calendar keeps the event in your local time zone.</div>
        </div>
      </div>
    </section>
  );
}

function CallRow({ call, next }: { call: WeeklyCall; next: boolean }) {
  return (
    <li className={`grid gap-4 rounded-xl border bg-white p-4 sm:grid-cols-[82px_minmax(0,1fr)_auto] sm:items-center sm:p-5 ${next ? "border-brand/30" : "border-navy/12"}`}>
      <div className="border-r border-navy/10 pr-3 text-center"><span className="block text-[10px] font-semibold text-brand-600">{new Date(call.startsAt).toLocaleDateString("en-US", { month: "short", timeZone: call.timezone })}</span><strong className="font-display text-2xl font-semibold text-navy">{new Date(call.startsAt).toLocaleDateString("en-US", { day: "numeric", timeZone: call.timezone })}</strong></div>
      <div className="min-w-0"><div className="flex items-center gap-2">{next ? <span className="h-2 w-2 rounded-full bg-success" /> : null}<h3 className="truncate font-display text-base font-semibold text-navy">{call.title}</h3></div><p className="mt-1 text-xs text-navy/45">{formatTime(call.startsAt, call.timezone)}–{formatTime(call.endsAt, call.timezone)} {zoneAbbreviation(call.startsAt, call.timezone)} · {call.hostName}</p><LocalCallTime startsAt={call.startsAt} endsAt={call.endsAt} sourceTimeZone={call.timezone} className="mt-0.5 block text-xs font-semibold text-brand-600" />{call.focusTopic ? <p className="mt-1 line-clamp-1 text-xs font-semibold text-brand-700">{call.focusTopic}</p> : null}</div>
      <div className="flex gap-2"><a href={googleCalendarTemplateUrl(call)} target="_blank" rel="noreferrer" aria-label={`Add ${call.title} to Google Calendar`} className="grid h-11 w-11 place-items-center rounded-lg border border-navy/10 text-navy hover:border-brand/35 hover:text-brand-600"><CalendarIcon className="h-5 w-5" /></a>{call.meetingUrl ? <a href={call.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-navy px-4 text-sm font-semibold text-white hover:bg-brand-600">Join</a> : null}</div>
    </li>
  );
}

function EmptySchedule() { return <section className="mt-7 rounded-xl border border-dashed border-navy/15 bg-white p-8 text-center sm:p-10"><CalendarIcon className="mx-auto h-7 w-7 text-brand-600" /><h2 className="mt-4 font-display text-2xl font-semibold text-navy">No call is scheduled yet</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-navy/52">The date, calendar link, and meeting room will appear after Scott publishes the next call.</p><Link href="/ultimate/community" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-navy px-5 text-sm font-semibold text-white">Ask in the community</Link></section>; }

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
