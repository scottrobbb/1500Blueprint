"use client";

import { useMemo, useState } from "react";
import { MathText } from "@/components/test/MathText";
import { QuestionContent } from "@/components/test/QuestionContent";
import {
  EXPLANATION_MAX_CHARACTERS,
  EXPLANATION_MIN_WORDS,
  countExplanationWords,
} from "@/lib/explanations/policy";
import type { ExplanationQueueItem } from "@/lib/explanations/queries";

type SourceFilter = "all" | ExplanationQueueItem["targetType"];
type DifficultyFilter = "all" | "easy" | "medium" | "hard";

export function ExplanationManager({
  initialItems,
  initialCompletedTotal,
}: {
  initialItems: ExplanationQueueItem[];
  initialCompletedTotal: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [completedTotal, setCompletedTotal] = useState(initialCompletedTotal);
  const [selectedKey, setSelectedKey] = useState(initialItems[0] ? itemKey(initialItems[0]) : null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [status, setStatus] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (
      (source === "all" || item.targetType === source)
      && (difficulty === "all" || item.difficulty === difficulty)
      && (!needle || `${item.sourceLabel} ${item.location} ${item.skill ?? ""} ${item.prompt}`.toLowerCase().includes(needle))
    ));
  }, [difficulty, items, query, source]);
  const selected = visible.find((item) => itemKey(item) === selectedKey) ?? visible[0] ?? null;

  function completeItem(completedItem: ExplanationQueueItem) {
    const completedKey = itemKey(completedItem);
    const completedIndex = items.findIndex((item) => itemKey(item) === completedKey);
    const remaining = items.filter((item) => itemKey(item) !== completedKey);
    const next = remaining[Math.min(Math.max(completedIndex, 0), remaining.length - 1)] ?? remaining[0] ?? null;

    setItems(remaining);
    setCompletedTotal((current) => current + 1);
    setSelectedKey(next ? itemKey(next) : null);
    setStatus(`Explanation saved. ${remaining.length.toLocaleString()} question${remaining.length === 1 ? "" : "s"} remain in this queue.`);
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-7 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex min-h-[560px] flex-col overflow-hidden rounded-[18px] border border-navy/10 bg-white shadow-pop lg:sticky lg:top-5 lg:h-[calc(100dvh-116px)] lg:min-h-0">
        <div className="border-b border-navy/10 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-600">Unanswered queue</p>
              <h2 className="mt-1 font-display text-xl font-extrabold text-navy">Choose the next explanation.</h2>
            </div>
            <span className="rounded-full bg-ice px-2.5 py-1 text-xs font-extrabold text-brand-700">{items.length.toLocaleString()} open</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-haze/65 px-3 py-2 text-xs text-navy/55">
            <span>Your completed explanations</span>
            <strong className="font-display text-base text-navy">{completedTotal.toLocaleString()}</strong>
          </div>
          <label htmlFor="queue-search" className="sr-only">Search explanation queue</label>
          <input id="queue-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search test, skill, or prompt" className="mt-3 min-h-11 w-full rounded-xl border border-navy/15 bg-haze/50 px-3 text-base text-navy outline-none placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15 sm:text-sm" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="sr-only" htmlFor="queue-source">Question source</label>
            <select id="queue-source" value={source} onChange={(event) => setSource(event.target.value as SourceFilter)} className="min-h-11 cursor-pointer rounded-xl border border-navy/15 bg-white px-3 text-sm font-bold text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
              <option value="all">All sources</option>
              <option value="question_bank">Question Bank</option>
              <option value="practice_test">Practice tests</option>
            </select>
            <label className="sr-only" htmlFor="queue-difficulty">Difficulty</label>
            <select id="queue-difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as DifficultyFilter)} className="min-h-11 cursor-pointer rounded-xl border border-navy/15 bg-white px-3 text-sm font-bold text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
              <option value="all">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-navy/45">Only unanswered Easy, Medium, and Hard questions appear here. Challenge questions stay with Scott.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visible.length ? visible.map((item) => {
            const active = selected && itemKey(selected) === itemKey(item);
            return (
              <button key={itemKey(item)} type="button" onClick={() => { setSelectedKey(itemKey(item)); setStatus(null); }} className={`mb-1 w-full cursor-pointer rounded-xl px-3 py-3 text-left transition-colors ${active ? "bg-navy text-white" : "hover:bg-haze"}`}>
                <span className={`text-[9px] font-extrabold uppercase tracking-[0.13em] ${active ? "text-sky" : "text-brand-600"}`}>{item.sourceLabel}</span>
                <strong className="mt-1 line-clamp-2 block text-sm leading-5">{item.prompt}</strong>
                <span className={`mt-1.5 flex items-center justify-between gap-2 text-[11px] ${active ? "text-white/50" : "text-navy/40"}`}>
                  <span className="truncate">{item.location}</span>
                  <span className="flex-none capitalize">{item.difficulty}</span>
                </span>
              </button>
            );
          }) : <p className="p-6 text-center text-sm leading-6 text-navy/45">{items.length ? "No questions match these filters." : "The eligible explanation queue is clear."}</p>}
        </div>
      </aside>

      <div className="min-w-0">
        {status ? <p role="status" className="mb-4 rounded-xl border border-success/20 bg-success-bg px-4 py-3 text-sm font-semibold text-success-600">{status}</p> : null}
        {selected ? <ExplanationWorkspace key={itemKey(selected)} item={selected} onSaved={() => completeItem(selected)} /> : (
          <section className="grid min-h-[420px] place-items-center rounded-[18px] border border-dashed border-navy/15 bg-white px-6 text-center">
            <div><p className="font-display text-xl font-extrabold text-navy">{items.length ? "No matching questions" : "Queue clear"}</p><p className="mt-2 text-sm leading-6 text-navy/45">{items.length ? "Change the source, difficulty, or search filters." : "Every eligible question in the current queue has an explanation."}</p></div>
          </section>
        )}
      </div>
    </div>
  );
}

function itemKey(item: Pick<ExplanationQueueItem, "targetType" | "id">): string {
  return `${item.targetType}:${item.id}`;
}

function ExplanationWorkspace({ item, onSaved }: { item: ExplanationQueueItem; onSaved: () => void }) {
  const [explanation, setExplanation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wordCount = countExplanationWords(explanation);
  const remainingWords = Math.max(0, EXPLANATION_MIN_WORDS - wordCount);
  const minimumMet = remainingWords === 0;

  async function save() {
    if (!minimumMet) return;
    setSaving(true);
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
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The explanation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[18px] border border-navy/10 bg-white shadow-pop">
      <header className="flex flex-wrap items-start gap-4 border-b border-navy/10 bg-haze/45 px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-600">{item.sourceLabel}</p><h2 className="mt-1 font-display text-xl font-extrabold text-navy">{item.location}</h2><p className="mt-1 text-xs text-navy/45">{item.skill ?? "General"} · <span className="capitalize">{item.difficulty}</span> · {item.published ? "Published" : "Draft"}</p></div>
        <span className="rounded-full bg-gold/15 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gold-600">Needs explanation</span>
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
          <textarea id="explanation" value={explanation} maxLength={EXPLANATION_MAX_CHARACTERS} onChange={(event) => setExplanation(event.target.value)} className="mt-3 min-h-[280px] w-full resize-y rounded-2xl border border-navy/15 bg-haze/35 p-4 font-mono text-sm leading-6 text-ink outline-none placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15" placeholder="Write a complete, student-facing explanation…" />
          <div className="mt-3" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span className={minimumMet ? "text-success-600" : "text-navy/50"}>{minimumMet ? "Minimum met" : `${remainingWords} more word${remainingWords === 1 ? "" : "s"} required`}</span>
              <span className="tabular-nums text-navy/45">{wordCount} / {EXPLANATION_MIN_WORDS} words</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy/[0.08]"><div className={`h-full rounded-full transition-[width] duration-200 ${minimumMet ? "bg-success" : "bg-brand"}`} style={{ width: `${Math.min(100, (wordCount / EXPLANATION_MIN_WORDS) * 100)}%` }} /></div>
          </div>
          <div className="mt-4 rounded-2xl border border-brand/15 bg-ice/45 p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-600">Live preview</p><div className="mt-3 font-serif text-[16px] leading-7 text-[#222]">{explanation.trim() ? <MathText>{explanation}</MathText> : <span className="font-sans text-sm text-navy/35">The formatted explanation appears here.</span>}</div></div>
          {error ? <p role="alert" className="mt-3 rounded-xl bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-600">{error}</p> : null}
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => void save()} disabled={saving || !minimumMet} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-navy/15 disabled:text-navy/35">{saving ? "Saving…" : "Save explanation"}</button></div>
        </div>
      </div>
    </section>
  );
}
