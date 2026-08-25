"use client";

import { useState } from "react";
import type { CallRecordingLesson, CallRecordingMonth, RecordingLessonStatus } from "@/lib/calls/types";

type LessonDraft = { title: string; vimeoUrl: string; status: RecordingLessonStatus };

const emptyLessonDraft: LessonDraft = { title: "", vimeoUrl: "", status: "published" };

export function CallRecordingsManager({ initialMonths }: { initialMonths: CallRecordingMonth[] }) {
  const [months, setMonths] = useState(initialMonths);
  const [monthInput, setMonthInput] = useState("");
  const [monthLabel, setMonthLabel] = useState("");
  const [addingMonth, setAddingMonth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lessonDrafts, setLessonDrafts] = useState<Record<string, LessonDraft>>({});
  const [addingLessonFor, setAddingLessonFor] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<LessonDraft>(emptyLessonDraft);

  function draftFor(monthId: string): LessonDraft {
    return lessonDrafts[monthId] ?? emptyLessonDraft;
  }

  async function addMonth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!monthInput) return;
    setAddingMonth(true);
    setError(null);
    const response = await fetch("/api/admin/call-recordings/months", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ monthDate: monthInput, label: monthLabel || undefined }),
    });
    const body = (await response.json().catch(() => null)) as { month?: CallRecordingMonth; error?: string } | null;
    if (!response.ok || !body?.month) {
      setError(body?.error ?? "That month could not be added.");
    } else {
      setMonths((current) => [...current, body.month as CallRecordingMonth].sort((a, b) => b.monthDate.localeCompare(a.monthDate)));
      setMonthInput("");
      setMonthLabel("");
    }
    setAddingMonth(false);
  }

  async function removeMonth(month: CallRecordingMonth) {
    if (!window.confirm(`Delete “${month.label}”? This removes every recording listed under it.`)) return;
    setError(null);
    const response = await fetch(`/api/admin/call-recordings/months/${month.id}`, { method: "DELETE" });
    if (response.ok) setMonths((current) => current.filter((item) => item.id !== month.id));
    else setError("That month could not be deleted.");
  }

  async function addLesson(monthId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = draftFor(monthId);
    setError(null);
    const response = await fetch("/api/admin/call-recordings/lessons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ monthId, ...draft }),
    });
    const body = (await response.json().catch(() => null)) as { lesson?: CallRecordingLesson; error?: string } | null;
    if (!response.ok || !body?.lesson) {
      setError(body?.error ?? "The recording could not be added.");
      return;
    }
    setMonths((current) => current.map((month) => month.id === monthId ? { ...month, lessons: [...month.lessons, body.lesson as CallRecordingLesson] } : month));
    setLessonDrafts((current) => ({ ...current, [monthId]: emptyLessonDraft }));
    setAddingLessonFor(null);
  }

  function startEdit(lesson: CallRecordingLesson) {
    setEditingLessonId(lesson.id);
    setEditDraft({ title: lesson.title, vimeoUrl: lesson.vimeoUrl, status: lesson.status });
    setError(null);
  }

  async function saveEdit(monthId: string, lessonId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`/api/admin/call-recordings/lessons/${lessonId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ monthId, ...editDraft }),
    });
    const body = (await response.json().catch(() => null)) as { lesson?: CallRecordingLesson; error?: string } | null;
    if (!response.ok || !body?.lesson) {
      setError(body?.error ?? "The recording could not be updated.");
      return;
    }
    setMonths((current) => current.map((month) => month.id === monthId
      ? { ...month, lessons: month.lessons.map((lesson) => lesson.id === lessonId ? (body.lesson as CallRecordingLesson) : lesson) }
      : month));
    setEditingLessonId(null);
  }

  async function removeLesson(monthId: string, lesson: CallRecordingLesson) {
    if (!window.confirm(`Delete “${lesson.title}”?`)) return;
    setError(null);
    const response = await fetch(`/api/admin/call-recordings/lessons/${lesson.id}`, { method: "DELETE" });
    if (response.ok) {
      setMonths((current) => current.map((month) => month.id === monthId ? { ...month, lessons: month.lessons.filter((item) => item.id !== lesson.id) } : month));
    } else setError("The recording could not be deleted.");
  }

  return (
    <div className="mt-8 border-t border-navy/10 pt-7">
      <div className="max-w-2xl">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Max programming</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold text-navy">Recordings library</h2>
        <p className="mt-2 text-sm leading-6 text-navy/55">Add a month, then drop in the Vimeo link for each call recorded that month. Students only see recordings marked Published.</p>
      </div>

      <form onSubmit={addMonth} className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-navy/10 bg-haze/35 p-4">
        <label className="text-xs font-extrabold text-navy/65"><span className="block">Month</span><input required type="month" value={monthInput} onChange={(event) => setMonthInput(event.target.value)} className={`mt-1.5 ${inputClass}`} /></label>
        <label className="text-xs font-extrabold text-navy/65"><span className="block">Label (optional)</span><input value={monthLabel} onChange={(event) => setMonthLabel(event.target.value)} placeholder="Defaults to “August 2026”" className={`mt-1.5 ${inputClass}`} /></label>
        <button disabled={addingMonth} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60">{addingMonth ? "Adding…" : "Add month"}</button>
      </form>

      {error ? <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-600">{error}</p> : null}

      <div className="mt-5 space-y-4">
        {months.length ? months.map((month) => (
          <article key={month.id} className="rounded-2xl border border-navy/10 bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-extrabold text-navy">{month.label}</h3>
              <button type="button" onClick={() => void removeMonth(month)} className="min-h-9 cursor-pointer rounded-lg border border-danger/20 px-3 text-xs font-extrabold text-danger-600 hover:bg-danger-bg">Delete month</button>
            </div>

            {month.lessons.length ? (
              <ul className="mt-3 space-y-2">
                {month.lessons.map((lesson) => (
                  <li key={lesson.id} className="rounded-xl border border-navy/10 bg-haze/25 p-3">
                    {editingLessonId === lesson.id ? (
                      <form onSubmit={(event) => saveEdit(month.id, lesson.id, event)} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-center">
                        <input required value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} className={inputClass} placeholder="Recording title" />
                        <input required type="url" value={editDraft.vimeoUrl} onChange={(event) => setEditDraft({ ...editDraft, vimeoUrl: event.target.value })} className={inputClass} placeholder="https://vimeo.com/..." />
                        <select value={editDraft.status} onChange={(event) => setEditDraft({ ...editDraft, status: event.target.value as RecordingLessonStatus })} className={inputClass}><option value="draft">Draft</option><option value="published">Published</option></select>
                        <div className="flex gap-2"><button className="min-h-10 cursor-pointer rounded-lg bg-navy px-3 text-xs font-extrabold text-white">Save</button><button type="button" onClick={() => setEditingLessonId(null)} className="min-h-10 cursor-pointer rounded-lg border border-navy/15 px-3 text-xs font-extrabold text-navy/60">Cancel</button></div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${lesson.status === "published" ? "bg-success-bg text-success-600" : "bg-gold/15 text-gold-600"}`}>{lesson.status}</span><strong className="truncate text-sm text-navy">{lesson.title}</strong></div>
                          <a href={lesson.vimeoUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-brand-700 hover:underline">{lesson.vimeoUrl}</a>
                        </div>
                        <div className="flex flex-none gap-2"><button type="button" onClick={() => startEdit(lesson)} className="min-h-9 cursor-pointer rounded-lg border border-navy/15 px-3 text-xs font-extrabold text-navy/65 hover:bg-white">Edit</button><button type="button" onClick={() => void removeLesson(month.id, lesson)} className="min-h-9 cursor-pointer rounded-lg border border-danger/20 px-3 text-xs font-extrabold text-danger-600 hover:bg-danger-bg">Delete</button></div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-xs text-navy/45">No recordings added for this month yet.</p>}

            {addingLessonFor === month.id ? (
              <form onSubmit={(event) => addLesson(month.id, event)} className="mt-3 grid gap-2 rounded-xl border border-dashed border-brand/30 bg-ice/35 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                <input required value={draftFor(month.id).title} onChange={(event) => setLessonDrafts({ ...lessonDrafts, [month.id]: { ...draftFor(month.id), title: event.target.value } })} className={inputClass} placeholder="Recording title" />
                <input required type="url" value={draftFor(month.id).vimeoUrl} onChange={(event) => setLessonDrafts({ ...lessonDrafts, [month.id]: { ...draftFor(month.id), vimeoUrl: event.target.value } })} className={inputClass} placeholder="https://vimeo.com/..." />
                <select value={draftFor(month.id).status} onChange={(event) => setLessonDrafts({ ...lessonDrafts, [month.id]: { ...draftFor(month.id), status: event.target.value as RecordingLessonStatus } })} className={inputClass}><option value="published">Published</option><option value="draft">Draft</option></select>
                <div className="flex gap-2"><button className="min-h-10 cursor-pointer rounded-lg bg-brand px-3 text-xs font-extrabold text-white hover:bg-brand-600">Add</button><button type="button" onClick={() => setAddingLessonFor(null)} className="min-h-10 cursor-pointer rounded-lg border border-navy/15 px-3 text-xs font-extrabold text-navy/60">Cancel</button></div>
              </form>
            ) : (
              <button type="button" onClick={() => setAddingLessonFor(month.id)} className="mt-3 min-h-10 cursor-pointer rounded-lg border border-dashed border-brand/35 px-3 text-xs font-extrabold text-brand-700 hover:bg-ice/45">+ Add a recording</button>
            )}
          </article>
        )) : <div className="rounded-2xl border border-dashed border-navy/15 bg-white p-8 text-center text-sm text-navy/45">No months added yet. Add one above to start uploading recordings.</div>}
      </div>
    </div>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-base text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm";
