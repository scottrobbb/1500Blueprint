"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AiMathContent,
  AnswerType,
  DrillConfig,
  DrillQuestion,
  SatSkill,
  WalkthroughStep,
} from "@/lib/drills/types";
import type { QuestionInput, WalkthroughStepInput } from "@/lib/drills/admin-queries";
import { MetadataPanel } from "@/components/admin/editor/MetadataPanel";
import { SharedFields } from "@/components/admin/editor/SharedFields";
import { WalkthroughEditor } from "@/components/admin/editor/WalkthroughEditor";
import { PreviewPane } from "@/components/admin/editor/PreviewPane";
import { FIELD_EDITORS } from "@/components/admin/editor/registry";
import { label, primaryBtn, secondaryBtn } from "@/components/drills/shared/ui";

// The full single-question authoring shell. Holds the in-flight question in
// local state, fans patches out to the metadata / shared / per-drill editors,
// mirrors the live preview, and persists via the admin question API.

// Strips state down to the API's QuestionInput (the shell owns these fields;
// walkthrough is sent separately).
function toQuestionInput(q: DrillQuestion): QuestionInput {
  // ai-math is the only multi-answer-type drill; content.kind is its source of
  // truth, so derive answerType from it to guarantee the stored row is consistent
  // regardless of which control the admin touched.
  const answerType: AnswerType =
    q.drillSlug === "ai-math"
      ? (q.content as AiMathContent).kind === "grid"
        ? "grid_in"
        : "mc_single"
      : q.answerType;
  return {
    id: q.id,
    section: q.section,
    domain: q.domain,
    skill: q.skill,
    difficulty: q.difficulty,
    answerType,
    stem: q.stem,
    passage: q.passage,
    figureUrl: q.figureUrl,
    content: q.content,
    explanation: q.explanation,
    status: q.status,
  };
}

function toWalkthroughInput(steps: WalkthroughStep[]): WalkthroughStepInput[] {
  return steps.map((s, i) => ({
    position: s.position ?? i + 1,
    kind: s.kind,
    text: s.text,
    detail: s.detail ?? null,
  }));
}

type Saving = "idle" | "saving" | "deleting";

export function QuestionEditor({
  initialQuestion,
  drill,
  skills,
  backHref = "/admin",
}: {
  initialQuestion: DrillQuestion;
  drill: DrillConfig;
  skills: SatSkill[];
  backHref?: string;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState<DrillQuestion>(initialQuestion);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");

  const ContentFields = FIELD_EDITORS[question.drillSlug];
  // Critical-path steps apply to AI process-graded drills (grammar) and to math
  // drills (Scott authors a solving walkthrough per math item, per the reference UI).
  const showWalkthrough = drill.aiRole === "grade-process" || drill.category === "Math";
  const published = question.status === "published";
  const busy = saving !== "idle";

  function onChange(patch: Partial<DrillQuestion>) {
    setQuestion((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function onWalkthroughChange(steps: WalkthroughStep[]) {
    setQuestion((prev) => ({ ...prev, walkthrough: steps }));
    setDirty(true);
  }

  // Persists the current state. Returns whether the write succeeded so callers
  // (publish toggle) can chain on it.
  async function persist(next: DrillQuestion): Promise<boolean> {
    setSaving("saving");
    try {
      const res = await fetch(`/admin/api/questions/${next.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: toQuestionInput(next),
          walkthrough: toWalkthroughInput(next.walkthrough ?? []),
        }),
      });
      if (!res.ok) return false;
      setDirty(false);
      router.refresh();
      return true;
    } finally {
      setSaving("idle");
    }
  }

  async function onSave() {
    await persist(question);
  }

  async function onTogglePublish() {
    const next: DrillQuestion = {
      ...question,
      status: published ? "draft" : "published",
    };
    setQuestion(next);
    await persist(next);
  }

  async function onDelete() {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    setSaving("deleting");
    try {
      const res = await fetch(`/admin/api/questions/${question.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push(backHref);
        return;
      }
    } finally {
      setSaving("idle");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3 rounded-card border border-navy/15 bg-white px-4 py-3">
        <span className="font-mono text-[13px] text-navy/45">
          #{question.id.slice(0, 8)}
        </span>
        <span className="font-display text-base font-bold text-navy">{drill.title}</span>
        <StatusPill published={published} />
        {dirty ? (
          <span className="text-[12px] font-medium text-gold-600">Unsaved changes</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={busy}
            className={secondaryBtn}
          >
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={busy || !dirty} className={primaryBtn}>
            {saving === "saving" ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="flex flex-col gap-5">
          <MetadataPanel
            question={question}
            skills={skills}
            answerTypes={drill.answerTypes}
            onChange={onChange}
          />

          <section className="rounded-card border border-navy/15 bg-white p-4">
            <h2 className={`${label} mb-4 text-navy/55`}>Question</h2>
            <SharedFields question={question} onChange={onChange} />
          </section>

          <section className="rounded-card border border-navy/15 bg-white p-4">
            <h2 className={`${label} mb-4 text-navy/55`}>Drill Content</h2>
            <ContentFields question={question} onChange={onChange} />
          </section>

          {showWalkthrough ? (
            <section className="rounded-card border border-navy/15 bg-white p-4">
              <WalkthroughEditor
                steps={question.walkthrough ?? []}
                onChange={onWalkthroughChange}
              />
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <PreviewPane question={question} />
        </aside>
      </div>

      <footer className="sticky bottom-0 z-30 -mx-6 flex flex-wrap items-center gap-3 border-t border-navy/12 bg-white/[0.92] px-6 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className={`${secondaryBtn} border-danger/30 text-danger hover:bg-danger-bg`}
        >
          {saving === "deleting" ? "Deleting…" : "Delete"}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onTogglePublish} disabled={busy} className={secondaryBtn}>
            {published ? "Unpublish" : "Publish"}
          </button>
          <button type="button" onClick={onSave} disabled={busy || !dirty} className={primaryBtn}>
            {saving === "saving" ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function StatusPill({ published }: { published: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-chip px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        published ? "bg-success-bg text-success-600" : "bg-navy/8 text-navy/55"
      }`}
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}
