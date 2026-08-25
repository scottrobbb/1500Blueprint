"use client";

import { useMemo, useState } from "react";
import { MathText } from "@/components/test/MathText";
import { QuestionContent } from "@/components/test/QuestionContent";
import type { ExplanationQueueItem } from "@/lib/explanations/queries";

type SourceFilter = "all" | ExplanationQueueItem["targetType"];

export function ExplanationManager({ initialItems }: { initialItems: ExplanationQueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [selectedKey, setSelectedKey] = useState(initialItems[0] ? itemKey(initialItems[0]) : null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [missingOnly, setMissingOnly] = useState(true);
  const selected = items.find((item) => itemKey(item) === selectedKey) ?? items[0] ?? null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (
      (source === "all" || item.targetType === source)
      && (!missingOnly || !item.explanation.trim())
      && (!needle || `${item.sourceLabel} ${item.location} ${item.skill ?? ""} ${item.prompt}`.toLowerCase().includes(needle))
    ));
  }, [items, missingOnly, query, source]);

  const completed = items.filter((item) => item.explanation.trim()).length;

  return (
    <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-7 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-[18px] border border-navy/10 bg-white shadow-pop lg:sticky lg:top-5 lg:h-[calc(100dvh-116px)]">
        <div className="border-b border-navy/10 p-4">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-600">Editorial queue</p><h2 className="mt-1 font-display text-xl font-extrabold text-navy">Make every answer teach.</h2></div>
            <span className="rounded-full bg-ice px-2.5 py-1 text-xs font-extrabold text-brand-700">{completed}/{items.length}</span>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search test, skill, or prompt" className="mt-4 min-h-11 w-full rounded-xl border border-navy/15 bg-haze/50 px-3 text-base text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={source} onChange={(event) => setSource(event.target.value as SourceFilter)} className="min-h-11 rounded-xl border border-navy/15 bg-white px-3 text-sm font-bold text-navy">
              <option value="all">All sources</option>
              <option value="question_bank">Question Bank</option>
              <option value="practice_test">Practice tests</option>
            </select>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-navy/15 px-3 text-xs font-bold text-navy"><input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} className="h-4 w-4 accent-brand" /> Missing only</label>
          </div>
        </div>
        <div className="h-[calc(100%-190px)] overflow-y-auto p-2">
          {visible.length ? visible.map((item) => (
            <button key={itemKey(item)} type="button" onClick={() => setSelectedKey(itemKey(item))} className={`mb-1 w-full cursor-pointer rounded-xl px-3 py-3 text-left transition-colors ${selected && itemKey(selected) === itemKey(item) ? "bg-navy text-white" : "hover:bg-haze"}`}>
              <span className={`text-[9px] font-extrabold uppercase tracking-[0.13em] ${selected && itemKey(selected) === itemKey(item) ? "text-sky" : "text-brand-600"}`}>{item.sourceLabel}</span>
              <strong className="mt-1 line-clamp-2 block text-sm leading-5">{item.prompt}</strong>
              <span className={`mt-1.5 block truncate text-[11px] ${selected && itemKey(selected) === itemKey(item) ? "text-white/50" : "text-navy/40"}`}>{item.location}</span>
            </button>
          )) : <p className="p-6 text-center text-sm leading-6 text-navy/45">No questions match these filters.</p>}
        </div>
      </aside>

      {selected ? <ExplanationWorkspace key={`${selected.targetType}-${selected.id}`} item={selected} onSaved={(explanation) => setItems((current) => current.map((item) => item.id === selected.id && item.targetType === selected.targetType ? { ...item, explanation } : item))} /> : (
        <section className="grid min-h-[420px] place-items-center rounded-[18px] border border-dashed border-navy/15 bg-white text-sm text-navy/45">The explanation queue is empty.</section>
      )}
    </div>
  );
}

function itemKey(item: Pick<ExplanationQueueItem, "targetType" | "id">): string {
  return `${item.targetType}:${item.id}`;
}

function ExplanationWorkspace({ item, onSaved }: { item: ExplanationQueueItem; onSaved: (explanation: string) => void }) {
  const [explanation, setExplanation] = useState(item.explanation);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const target = item.targetType === "question_bank" ? "question-bank" : "practice-test";
    try {
      const response = await fetch(`/api/manager/explanations/${target}/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ explanation }),
      });
      const body = (await response.json().catch(() => null)) as { explanation?: string; error?: string } | null;
      if (!response.ok || !body?.explanation) throw new Error(body?.error ?? "The explanation could not be saved.");
      setExplanation(body.explanation);
      onSaved(body.explanation);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The explanation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[18px] border border-navy/10 bg-white shadow-pop">
      <header className="flex flex-wrap items-start gap-4 border-b border-navy/10 bg-haze/45 px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-600">{item.sourceLabel}</p><h2 className="mt-1 font-display text-xl font-extrabold text-navy">{item.location}</h2><p className="mt-1 text-xs text-navy/45">{item.skill ?? "General"} · {item.difficulty} · {item.published ? "Published" : "Draft"}</p></div>
        <span className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide ${item.explanation.trim() ? "bg-success-bg text-success-600" : "bg-gold/15 text-gold-600"}`}>{item.explanation.trim() ? "Explanation present" : "Needs explanation"}</span>
      </header>

      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-[#d8dce3] bg-white p-5">
          <p className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-navy/35">Student view</p>
          {item.passage ? <div className="mb-5 border-b border-navy/10 pb-5"><QuestionContent text={item.passage} pClassName="font-serif text-[16px] leading-7 text-[#111]" /></div> : null}
          <QuestionContent text={item.prompt} pClassName="font-serif text-[17px] leading-7 text-[#111]" />
          {item.choices.length ? <ol className="mt-5 space-y-2">{item.choices.map((choice) => <li key={choice.id} className="flex gap-3 rounded-xl border border-[#b9bec8] px-3 py-2.5 font-serif text-[15px]"><span className="font-sans text-xs font-bold">{choice.id}</span><MathText>{choice.text}</MathText></li>)}</ol> : null}
          <div className="mt-5 rounded-xl bg-success-bg px-4 py-3 text-sm font-bold text-success-600">Correct answer: <MathText>{item.correctAnswer || "Not configured"}</MathText></div>
        </div>

        <div className="min-w-0">
          <label htmlFor="explanation" className="text-sm font-extrabold text-navy">Explanation</label>
          <p className="mt-1 text-xs leading-5 text-navy/45">Explain why the correct answer works and why the tempting wrong path fails. LaTeX delimiters render in the preview.</p>
          <textarea id="explanation" value={explanation} onChange={(event) => { setExplanation(event.target.value); setSaved(false); }} className="mt-3 min-h-[280px] w-full resize-y rounded-2xl border border-navy/15 bg-haze/35 p-4 font-mono text-sm leading-6 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" placeholder="Write a complete, student-facing explanation…" />
          <div className="mt-4 rounded-2xl border border-brand/15 bg-ice/45 p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-600">Live preview</p><div className="mt-3 font-serif text-[16px] leading-7 text-[#222]">{explanation.trim() ? <MathText>{explanation}</MathText> : <span className="font-sans text-sm text-navy/35">The formatted explanation appears here.</span>}</div></div>
          {error ? <p role="alert" className="mt-3 rounded-xl bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-600">{error}</p> : null}
          <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-success-600">{saved ? "Saved and added to the audit log." : ""}</span><button type="button" onClick={() => void save()} disabled={saving || !explanation.trim() || explanation.trim() === item.explanation.trim()} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-navy/15 disabled:text-navy/35">{saving ? "Saving…" : "Save explanation"}</button></div>
        </div>
      </div>
    </section>
  );
}
