"use client";

import { useState } from "react";
import type { WeeklyCall, WeeklyCallInput, WeeklyCallStatus } from "@/lib/calls/types";

type Draft = Omit<WeeklyCallInput, "startsAt" | "endsAt"> & { startsAt: string; endsAt: string };

export function WeeklyCallsManager({
  initialCalls,
  calendarConfigured,
  emailConfigured,
}: {
  initialCalls: WeeklyCall[];
  calendarConfigured: boolean;
  emailConfigured: boolean;
}) {
  const [calls, setCalls] = useState(initialCalls);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => newDraft());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function edit(call: WeeklyCall) {
    setEditingId(call.id);
    setDraft({
      title: call.title,
      description: call.description,
      focusTopic: call.focusTopic,
      hostName: call.hostName,
      startsAt: localDateTime(call.startsAt),
      endsAt: localDateTime(call.endsAt),
      timezone: call.timezone,
      meetingUrl: call.meetingUrl,
      recordingUrl: call.recordingUrl,
      status: call.status,
    });
    setMessage(null);
    setError(null);
  }

  function reset() {
    setEditingId(null);
    setDraft(newDraft());
    setMessage(null);
    setError(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    const input = {
      ...draft,
      startsAt: new Date(draft.startsAt).toISOString(),
      endsAt: new Date(draft.endsAt).toISOString(),
      description: draft.description || null,
      focusTopic: draft.focusTopic || null,
      meetingUrl: draft.meetingUrl || null,
      recordingUrl: draft.recordingUrl || null,
    };
    const response = await fetch(editingId ? `/api/admin/weekly-calls/${editingId}` : "/api/admin/weekly-calls", {
      method: editingId ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => null)) as {
      call?: WeeklyCall;
      warning?: string;
      emailWarning?: string;
      email?: { status: string; scheduledFor: string | null } | null;
      error?: string;
      sync?: { configured: boolean };
    } | null;
    if (!response.ok || !body?.call) {
      setError(body?.error ?? "The weekly call could not be saved.");
    } else {
      setCalls((current) => editingId
        ? current.map((call) => call.id === editingId ? body.call as WeeklyCall : call)
        : [body.call as WeeklyCall, ...current]);
      const baseMessage = body.call.status !== "published"
        ? "Call saved. Publish it when it is ready to appear for students and synchronize with Google Calendar."
        : body.warning
          ? `Call saved. Calendar sync needs attention: ${body.warning}`
          : body.sync?.configured
            ? "Call saved and synchronized with Google Calendar."
            : "Call saved. Add Google credentials later for automatic Calendar and Meet sync.";
      const emailMessage = body.emailWarning
        ? ` ${body.emailWarning}`
        : body.email?.status === "pending" || body.email?.status === "scheduled"
          ? ` Student email reminder ${body.email.scheduledFor ? `is scheduled for ${formatEmailDate(body.email.scheduledFor)}.` : "is queued."}`
          : body.email?.status === "cancelled"
            ? " The student email reminder is cancelled."
            : "";
      setEditingId(body.call.id);
      edit(body.call);
      setMessage(`${baseMessage}${emailMessage}`);
    }
    setSaving(false);
  }

  async function remove(call: WeeklyCall) {
    if (!window.confirm(`Delete “${call.title}”? The synced Google event will also be removed.`)) return;
    setError(null);
    const response = await fetch(`/api/admin/weekly-calls/${call.id}`, { method: "DELETE" });
    if (response.ok) {
      setCalls((current) => current.filter((item) => item.id !== call.id));
      if (editingId === call.id) reset();
    } else setError("The weekly call could not be deleted.");
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Max programming</p><h2 className="mt-1 font-display text-2xl font-extrabold text-navy">Weekly calls</h2><p className="mt-2 text-sm leading-6 text-navy/55">Publish the student schedule, attach recordings, and keep Google Calendar and Meet aligned from one place.</p></div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${calendarConfigured ? "bg-success-bg text-success-600" : "bg-gold/15 text-gold-600"}`}>{calendarConfigured ? "Google sync connected" : "Google sync not configured"}</span>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${emailConfigured ? "bg-success-bg text-success-600" : "bg-gold/15 text-gold-600"}`}>{emailConfigured ? "Email reminders connected" : "Email reminders not configured"}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={save} className="rounded-2xl border border-navy/10 bg-haze/35 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><h3 className="font-display text-lg font-extrabold text-navy">{editingId ? "Edit call" : "Schedule a call"}</h3>{editingId ? <button type="button" onClick={reset} className="min-h-10 cursor-pointer text-xs font-extrabold text-brand-700">New call</button> : null}</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Title" wide><input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inputClass} placeholder="Weekly SAT strategy call" /></Field>
            <Field label="Focus topic"><input value={draft.focusTopic ?? ""} onChange={(event) => setDraft({ ...draft, focusTopic: event.target.value })} className={inputClass} placeholder="Adaptive Math timing" /></Field>
            <Field label="Host"><input required value={draft.hostName} onChange={(event) => setDraft({ ...draft, hostName: event.target.value })} className={inputClass} /></Field>
            <Field label="Starts"><input required type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} className={inputClass} /></Field>
            <Field label="Ends"><input required type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} className={inputClass} /></Field>
            <Field label="Meeting URL"><input type="url" value={draft.meetingUrl ?? ""} onChange={(event) => setDraft({ ...draft, meetingUrl: event.target.value })} className={inputClass} placeholder="Created automatically when Google sync is connected" /></Field>
            <Field label="Recording URL"><input type="url" value={draft.recordingUrl ?? ""} onChange={(event) => setDraft({ ...draft, recordingUrl: event.target.value })} className={inputClass} placeholder="Add after the call" /></Field>
            <Field label="Status"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as WeeklyCallStatus })} className={inputClass}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></Field>
            <Field label="Description" wide><textarea value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${inputClass} min-h-28 py-3`} placeholder="What students should bring and what the call covers." /></Field>
          </div>
          {message ? <p role="status" className="mt-4 rounded-xl bg-success-bg px-3 py-2 text-sm font-semibold text-success-600">{message}</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-600">{error}</p> : null}
          <div className="mt-5 flex justify-end"><button disabled={saving} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60">{saving ? "Saving…" : editingId ? "Save call" : "Create call"}</button></div>
        </form>

        <aside className="space-y-3">
          {calls.length ? calls.map((call) => (
            <article key={call.id} className={`rounded-2xl border p-4 ${editingId === call.id ? "border-brand/40 bg-ice/45" : "border-navy/10 bg-white"}`}>
              <div className="flex items-start justify-between gap-3"><div><span className={`text-[9px] font-extrabold uppercase tracking-wide ${call.status === "published" ? "text-success-600" : call.status === "cancelled" ? "text-danger-600" : "text-gold-600"}`}>{call.status}</span><h3 className="mt-1 font-display text-base font-extrabold text-navy">{call.title}</h3></div>{call.googleEventId ? <span title="Synced with Google Calendar" className="grid h-8 w-8 place-items-center rounded-lg bg-white text-brand-700 shadow-sm">G</span> : null}</div>
              <p className="mt-2 text-xs font-semibold text-navy/45">{formatCallDate(call.startsAt, call.timezone)} · {formatCallTime(call.startsAt, call.timezone)}–{formatCallTime(call.endsAt, call.timezone)}</p>
              <div className="mt-4 flex gap-2"><button type="button" onClick={() => edit(call)} className="min-h-10 flex-1 cursor-pointer rounded-xl bg-navy px-3 text-xs font-extrabold text-white hover:bg-brand-600">Edit</button><button type="button" onClick={() => void remove(call)} className="min-h-10 cursor-pointer rounded-xl border border-danger/20 px-3 text-xs font-extrabold text-danger-600 hover:bg-danger-bg">Delete</button></div>
            </article>
          )) : <div className="rounded-2xl border border-dashed border-navy/15 bg-white p-8 text-center text-sm text-navy/45">No calls scheduled yet.</div>}
        </aside>
      </div>
    </div>
  );
}

const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-base text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm";

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`text-xs font-extrabold text-navy/65 ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>;
}

function newDraft(): Draft {
  const start = new Date();
  start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7 || 7));
  start.setHours(11, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { title: "Weekly SAT strategy call", description: null, focusTopic: null, hostName: "Scott Robinson", startsAt: localDateTime(start.toISOString()), endsAt: localDateTime(end.toISOString()), timezone: "America/New_York", meetingUrl: null, recordingUrl: null, status: "draft" };
}

function localDateTime(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatCallDate(value: string, timeZone: string): string { return new Date(value).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone }); }
function formatCallTime(value: string, timeZone: string): string { return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }); }
function formatEmailDate(value: string): string { return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
