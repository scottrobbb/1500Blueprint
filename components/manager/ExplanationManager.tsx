"use client";

import { useMemo, useState } from "react";
import { ExplanationText } from "@/components/test/ExplanationText";
import { MathText } from "@/components/test/MathText";
import { QuestionContent } from "@/components/test/QuestionContent";
import {
  EXPLANATION_MAX_CHARACTERS,
  EXPLANATION_MIN_WORDS,
  countExplanationWords,
} from "@/lib/explanations/policy";
import type { ExplanationQueueItem } from "@/lib/explanations/queries";
import { createClient } from "@/utils/supabase/client";

async function uploadPastedImage(file: File): Promise<string | null> {
  const response = await fetch("/api/manager/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: file.name || `pasted-${Date.now()}.png`, type: file.type, size: file.size }),
  });
  const signed = (await response.json().catch(() => null)) as { path?: string; token?: string; url?: string; error?: string } | null;
  if (!response.ok || !signed?.path || !signed.token || !signed.url) return null;
  const uploaded = await createClient().storage.from("course-assets").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type, cacheControl: "31536000" });
  if (uploaded.error) return null;
  return signed.url;
}

type SourceFilter = "all" | ExplanationQueueItem["targetType"];
type DifficultyFilter = "all" | "easy" | "medium" | "hard";

export function ExplanationManager({
  initialItems,
  initialCompletedTotal,
  initialRemainingTotal,
}: {
  initialItems: ExplanationQueueItem[];
  initialCompletedTotal: number;
  initialRemainingTotal: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [completedTotal, setCompletedTotal] = useState(initialCompletedTotal);
  const [remainingTotal, setRemainingTotal] = useState(initialRemainingTotal);
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
    setRemainingTotal((current) => Math.max(0, current - 1));
    setSelectedKey(next ? itemKey(next) : null);
    setStatus(`Explanation saved. ${remaining.length.toLocaleString()} question${remaining.length === 1 ? "" : "s"} remain in this queue.`);
  }

  function patchItem(patchedItem: ExplanationQueueItem, patch: Partial<ExplanationQueueItem>) {
    const patchedKey = itemKey(patchedItem);
    setItems((current) => current.map((item) => (itemKey(item) === patchedKey ? { ...item, ...patch } : item)));
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
            <span className="rounded-full bg-ice px-2.5 py-1 text-xs font-extrabold text-brand-700">{remainingTotal.toLocaleString()} open</span>
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
        {selected ? (
          <ExplanationWorkspace
            key={itemKey(selected)}
            item={selected}
            onSaved={() => completeItem(selected)}
            onQuestionUpdated={(patch) => patchItem(selected, patch)}
          />
        ) : (
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

function ExplanationWorkspace({
  item,
  onSaved,
  onQuestionUpdated,
}: {
  item: ExplanationQueueItem;
  onSaved: () => void;
  onQuestionUpdated: (patch: Partial<ExplanationQueueItem>) => void;
}) {
  const [explanation, setExplanation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastingImage, setPastingImage] = useState(false);
  const [pasteError, setPasteError] = useState(false);
  const wordCount = countExplanationWords(explanation);
  const remainingWords = Math.max(0, EXPLANATION_MIN_WORDS - wordCount);
  const minimumMet = remainingWords === 0;

  const [editingQuestion, setEditingQuestion] = useState(false);
  const [promptDraft, setPromptDraft] = useState(item.prompt);
  const [passageDraft, setPassageDraft] = useState(item.passage ?? "");
  const [choiceDrafts, setChoiceDrafts] = useState(item.choices);
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);

  function startEditingQuestion() {
    setPromptDraft(item.prompt);
    setPassageDraft(item.passage ?? "");
    setChoiceDrafts(item.choices);
    setQuestionError(null);
    setEditingQuestion(true);
  }

  function cancelEditingQuestion() {
    setEditingQuestion(false);
    setQuestionError(null);
  }

  async function saveQuestionContent() {
    const patch: Record<string, unknown> = {};
    const nextPrompt = promptDraft.trim();
    const nextPassage = passageDraft.trim();
    if (nextPrompt !== item.prompt) patch.prompt = nextPrompt;
    if (nextPassage !== (item.passage ?? "")) patch.passage = nextPassage;
    const trimmedChoices = choiceDrafts.map((choice) => ({ id: choice.id, text: choice.text.trim() }));
    if (trimmedChoices.some((choice, index) => choice.text !== item.choices[index]?.text)) patch.choices = trimmedChoices;

    if (Object.keys(patch).length === 0) {
      setEditingQuestion(false);
      return;
    }

    setQuestionSaving(true);
    setQuestionError(null);
    const target = item.targetType === "question_bank" ? "question-bank" : "practice-test";
    try {
      const response = await fetch(`/api/manager/questions/${target}/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const responseBody = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !responseBody?.ok) throw new Error(responseBody?.error ?? "The question could not be updated.");
      onQuestionUpdated({
        prompt: (patch.prompt as string | undefined) ?? item.prompt,
        passage: patch.passage !== undefined ? ((patch.passage as string) || null) : item.passage,
        choices: (patch.choices as { id: string; text: string }[] | undefined) ?? item.choices,
      });
      setEditingQuestion(false);
    } catch (reason) {
      setQuestionError(reason instanceof Error ? reason.message : "The question could not be updated.");
    } finally {
      setQuestionSaving(false);
    }
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const cursor = event.currentTarget.selectionStart;
    setPastingImage(true);
    setPasteError(false);
    const url = await uploadPastedImage(file);
    setPastingImage(false);
    if (!url) { setPasteError(true); return; }
    setExplanation((current) => `${current.slice(0, cursor)}\n![](${url})\n${current.slice(cursor)}`);
  }

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
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-navy/35">Student view</p>
            {!editingQuestion ? (
              <button type="button" onClick={startEditingQuestion} className="min-h-8 cursor-pointer rounded-lg border border-navy/15 px-3 text-xs font-bold text-navy/70 transition-colors hover:border-brand/40 hover:text-brand-700">
                Fix wording / LaTeX
              </button>
            ) : null}
          </div>

          {editingQuestion ? (
            <div className="space-y-5">
              <p className="rounded-xl bg-ice/60 px-3 py-2 text-xs leading-5 text-navy/60">Fix typos or broken LaTeX in the question&rsquo;s own text. The correct answer, difficulty, and choice order can&rsquo;t be changed here — ask Scott for anything beyond wording.</p>
              {item.passage ? (
                <div>
                  <label htmlFor="passage-draft" className="text-xs font-extrabold text-navy/50">Passage</label>
                  <textarea id="passage-draft" value={passageDraft} onChange={(event) => setPassageDraft(event.target.value)} className="mt-1.5 min-h-[120px] w-full resize-y rounded-xl border border-navy/15 bg-haze/35 p-3 font-mono text-sm leading-6 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
                  <div className="mt-2 rounded-xl border border-navy/10 bg-haze/20 p-3"><QuestionContent text={passageDraft} pClassName="font-serif text-[15px] leading-7 text-[#111]" /></div>
                </div>
              ) : null}
              <div>
                <label htmlFor="prompt-draft" className="text-xs font-extrabold text-navy/50">Prompt</label>
                <textarea id="prompt-draft" value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} className="mt-1.5 min-h-[90px] w-full resize-y rounded-xl border border-navy/15 bg-haze/35 p-3 font-mono text-sm leading-6 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
                <div className="mt-2 rounded-xl border border-navy/10 bg-haze/20 p-3"><QuestionContent text={promptDraft} pClassName="font-serif text-[15px] leading-7 text-[#111]" /></div>
              </div>
              {choiceDrafts.length ? (
                <div>
                  <p className="text-xs font-extrabold text-navy/50">Choices</p>
                  <div className="mt-1.5 space-y-2">
                    {choiceDrafts.map((choice, index) => (
                      <div key={choice.id} className="rounded-xl border border-navy/15 bg-haze/25 p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-sans text-xs font-bold text-navy/50">{choice.id}</span>
                          <input
                            value={choice.text}
                            onChange={(event) => setChoiceDrafts((current) => current.map((c, i) => (i === index ? { ...c, text: event.target.value } : c)))}
                            className="min-h-9 w-full rounded-lg border border-navy/15 bg-white px-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                          />
                        </div>
                        <div className="mt-1.5 pl-6 font-serif text-sm text-[#333]"><MathText>{choice.text}</MathText></div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {questionError ? <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-600">{questionError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={cancelEditingQuestion} disabled={questionSaving} className="min-h-9 cursor-pointer rounded-lg px-4 text-xs font-bold text-navy/60 transition-colors hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => void saveQuestionContent()} disabled={questionSaving} className="min-h-9 cursor-pointer rounded-lg bg-navy px-4 text-xs font-extrabold text-white transition-colors hover:bg-navy/85 disabled:cursor-not-allowed disabled:opacity-50">{questionSaving ? "Saving…" : "Save question text"}</button>
              </div>
            </div>
          ) : (
            <>
              {item.passage ? <div className="mb-5 border-b border-navy/10 pb-5"><QuestionContent text={item.passage} pClassName="font-serif text-[16px] leading-7 text-[#111]" /></div> : null}
              <QuestionContent text={item.prompt} pClassName="font-serif text-[17px] leading-7 text-[#111]" />
              {item.choices.length ? <ol className="mt-5 space-y-2">{item.choices.map((choice) => <li key={choice.id} className="flex gap-3 rounded-xl border border-[#b9bec8] px-3 py-2.5 font-serif text-[15px]"><span className="font-sans text-xs font-bold">{choice.id}</span><MathText>{choice.text}</MathText></li>)}</ol> : null}
              <div className="mt-5 rounded-xl bg-success-bg px-4 py-3 text-sm font-bold text-success-600">Correct answer: <MathText>{item.correctAnswer || "Not configured"}</MathText></div>
            </>
          )}
        </div>

        <div className="min-w-0">
          <label htmlFor="explanation" className="text-sm font-extrabold text-navy">Explanation</label>
          <p className="mt-1 text-xs leading-5 text-navy/45">Explain why the correct answer works and why the tempting wrong path fails. LaTeX delimiters render in the preview. Paste a screenshot to drop it in.</p>
          <textarea id="explanation" value={explanation} maxLength={EXPLANATION_MAX_CHARACTERS} onChange={(event) => setExplanation(event.target.value)} onPaste={(event) => void handlePaste(event)} className="mt-3 min-h-[280px] w-full resize-y rounded-2xl border border-navy/15 bg-haze/35 p-4 font-mono text-sm leading-6 text-ink outline-none placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15" placeholder="Write a complete, student-facing explanation…" />
          {pastingImage ? <p className="mt-1.5 text-xs font-semibold text-brand-700">Uploading pasted screenshot…</p> : null}
          {pasteError ? <p role="alert" className="mt-1.5 text-xs font-semibold text-danger-600">That screenshot could not be uploaded.</p> : null}
          <div className="mt-3" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span className={minimumMet ? "text-success-600" : "text-navy/50"}>{minimumMet ? "Minimum met" : `${remainingWords} more word${remainingWords === 1 ? "" : "s"} required`}</span>
              <span className="tabular-nums text-navy/45">{wordCount} / {EXPLANATION_MIN_WORDS} words</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy/[0.08]"><div className={`h-full rounded-full transition-[width] duration-200 ${minimumMet ? "bg-success" : "bg-brand"}`} style={{ width: `${Math.min(100, (wordCount / EXPLANATION_MIN_WORDS) * 100)}%` }} /></div>
          </div>
          <div className="mt-4 rounded-2xl border border-brand/15 bg-ice/45 p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-600">Live preview</p><div className="mt-3 font-serif text-[16px] leading-7 text-[#222]">{explanation.trim() ? <ExplanationText text={explanation} /> : <span className="font-sans text-sm text-navy/35">The formatted explanation appears here.</span>}</div></div>
          {error ? <p role="alert" className="mt-3 rounded-xl bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-600">{error}</p> : null}
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => void save()} disabled={saving || !minimumMet} className="min-h-11 cursor-pointer rounded-xl bg-brand px-5 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-navy/15 disabled:text-navy/35">{saving ? "Saving…" : "Save explanation"}</button></div>
        </div>
      </div>
    </section>
  );
}
