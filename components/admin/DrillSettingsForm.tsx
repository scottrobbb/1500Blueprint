"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Accent, DrillCategory, DrillConfig } from "@/lib/drills/types";
import type { DrillUpdate } from "@/lib/drills/admin-queries";
import { label, primaryBtn, secondaryBtn } from "@/components/drills/shared/ui";

// Edits the per-drill-TYPE config (title, category, accent, and — only for AI
// drills — the grading prompt + scoringConfig JSON). Saves via PUT
// /admin/api/drills/<slug>. scoringConfig is a free-form JSON textarea because
// its shape varies per drill; it is validated before save.

const CATEGORIES: DrillCategory[] = ["Writing", "Reading", "Math", "Vocabulary"];
const ACCENTS: Accent[] = ["brand", "navy", "gold", "sky"];

type Saving = "idle" | "saving";

export function DrillSettingsForm({ drill, backHref = "/admin/drills" }: { drill: DrillConfig; backHref?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(drill.title);
  const [category, setCategory] = useState<DrillCategory>(drill.category);
  const [accent, setAccent] = useState<Accent>(drill.accent);
  const [status, setStatus] = useState(drill.status);
  const [gradingPrompt, setGradingPrompt] = useState(drill.gradingPrompt ?? "");
  const [scoringText, setScoringText] = useState(() =>
    JSON.stringify(drill.scoringConfig ?? {}, null, 2),
  );

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function touch() {
    setDirty(true);
    setSaveError(null);
  }

  function onScoringChange(value: string) {
    setScoringText(value);
    touch();
    if (value.trim() === "") {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  }

  async function onSave() {
    if (jsonError) return;

    let scoringConfig: Record<string, unknown> = {};
    if (scoringText.trim()) {
      try {
        const parsed = JSON.parse(scoringText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          scoringConfig = parsed as Record<string, unknown>;
        } else {
          setJsonError("Scoring config must be a JSON object");
          return;
        }
      } catch {
        setJsonError("Invalid JSON");
        return;
      }
    }

    const patch: DrillUpdate = { title, category, accent, status, scoringConfig };
    if (drill.usesAi) patch.gradingPrompt = gradingPrompt.trim() || null;

    setSaving("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/admin/api/drills/${drill.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const result = (await res.json().catch(() => null)) as { detail?: string } | null;
        setSaveError(result?.detail ?? "Save failed. Please try again.");
        return;
      }
      setDirty(false);
      router.refresh();
    } catch {
      setSaveError("Save failed. Check your connection and retry.");
    } finally {
      setSaving("idle");
    }
  }

  const busy = saving === "saving";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-navy">
          {drill.title}
        </h1>
        <span className="font-mono text-[13px] text-navy/45">{drill.slug}</span>
        {drill.usesAi ? (
          <span className="inline-flex items-center rounded-chip bg-brand/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            AI · {drill.aiRole}
          </span>
        ) : null}
      </header>

      <section className="rounded-card border border-navy/15 bg-white p-4">
        <h2 className={`${label} mb-4 text-navy/55`}>General</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField labelText="Title" className="sm:col-span-2">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                touch();
              }}
              className={inputClass}
            />
          </FormField>

          <FormField labelText="Category">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as DrillCategory);
                touch();
              }}
              className={selectClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>

          <FormField labelText="Accent">
            <select
              value={accent}
              onChange={(e) => {
                setAccent(e.target.value as Accent);
                touch();
              }}
              className={selectClass}
            >
              {ACCENTS.map((a) => (
                <option key={a} value={a}>
                  {capitalize(a)}
                </option>
              ))}
            </select>
          </FormField>

          <FormField labelText="Publication status" className="sm:col-span-2">
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value === "published" ? "published" : "draft");
                touch();
              }}
              className={selectClass}
            >
              <option value="draft">Draft — admin QA only</option>
              <option value="published">Published — student visible</option>
            </select>
          </FormField>
        </div>
      </section>

      {drill.usesAi ? (
        <section className="rounded-card border border-navy/15 bg-white p-4">
          <h2 className={`${label} mb-1 text-navy/55`}>Grading Prompt</h2>
          <p className="mb-3 text-[13px] text-navy/50">
            The system prompt the AI uses to grade this drill ({drill.aiRole}).
          </p>
          <textarea
            value={gradingPrompt}
            onChange={(e) => {
              setGradingPrompt(e.target.value);
              touch();
            }}
            rows={12}
            spellCheck={false}
            className={`${inputClass} resize-y font-mono text-[13px] leading-relaxed`}
            placeholder="You are grading a student's explanation…"
          />
        </section>
      ) : null}

      <section className="rounded-card border border-navy/15 bg-white p-4">
        <h2 className={`${label} mb-1 text-navy/55`}>Scoring Config</h2>
        <p className="mb-3 text-[13px] text-navy/50">
          Drill-specific scoring parameters as a JSON object (shape varies per drill).
        </p>
        <textarea
          value={scoringText}
          onChange={(e) => onScoringChange(e.target.value)}
          rows={10}
          spellCheck={false}
          className={`${inputClass} resize-y font-mono text-[13px] leading-relaxed ${
            jsonError ? "border-danger focus:border-danger focus:ring-danger/15" : ""
          }`}
        />
        {jsonError ? (
          <p className="mt-2 text-[13px] font-medium text-danger">{jsonError}</p>
        ) : null}
      </section>

      <div className="sticky bottom-0 z-30 -mx-6 flex flex-wrap items-center gap-3 border-t border-navy/12 bg-white/[0.92] px-6 py-3 backdrop-blur-md">
        {dirty ? (
          <span className="text-[12px] font-medium text-gold-600">Unsaved changes</span>
        ) : null}
        {saveError ? (
          <span className="text-[12px] font-medium text-danger">{saveError}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            disabled={busy}
            className={secondaryBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !dirty || !!jsonError}
            className={primaryBtn}
          >
            {busy ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  labelText,
  className,
  children,
}: {
  labelText: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <span className={`${label} mb-1.5 block text-navy/55`}>{labelText}</span>
      {children}
    </div>
  );
}

const selectClass =
  "w-full appearance-none rounded-[10px] border-[1.5px] border-navy/[0.18] bg-white px-[13px] py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";
const inputClass =
  "w-full rounded-[10px] border-[1.5px] border-navy/[0.18] bg-white px-[13px] py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
