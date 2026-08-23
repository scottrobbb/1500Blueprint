"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminTest } from "@/lib/sat/admin-queries";
import { label, primaryBtn } from "@/components/drills/shared/ui";

// Edits the test-level settings: title, between-section break, and the two
// adaptive routing thresholds. Saves via PUT /admin/api/tests/<slug>. The
// per-question content is edited separately in the outline below this form.

type Saving = "idle" | "saving";

export function TestSettingsForm({ test }: { test: AdminTest }) {
  const router = useRouter();
  const [title, setTitle] = useState(test.title);
  const [breakMinutes, setBreakMinutes] = useState(String(test.breakMinutes));
  const [rwThreshold, setRwThreshold] = useState(String(test.rwThreshold));
  const [mathThreshold, setMathThreshold] = useState(String(test.mathThreshold));
  const [status, setStatus] = useState(test.status);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");
  const [error, setError] = useState<string | null>(null);

  function touch() {
    setDirty(true);
    setError(null);
  }

  async function onSave() {
    const brk = Number(breakMinutes);
    const rw = Number(rwThreshold);
    const math = Number(mathThreshold);
    if (!title.trim()) return setError("Title is required.");
    if (!Number.isFinite(brk) || brk < 0 || brk > 60) return setError("Break must be 0–60 minutes.");
    if (!Number.isFinite(rw) || rw <= 0 || rw > 1) return setError("R&W threshold must be between 0 and 1.");
    if (!Number.isFinite(math) || math <= 0 || math > 1) return setError("Math threshold must be between 0 and 1.");

    setSaving("saving");
    setError(null);
    try {
      const res = await fetch(`/admin/api/tests/${test.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          breakMinutes: brk,
          rwThreshold: rw,
          mathThreshold: math,
          status,
        }),
      });
      if (!res.ok) {
        const result = (await res.json().catch(() => null)) as { detail?: string } | null;
        setError(result?.detail ?? "Save failed. Please try again.");
        return;
      }
      setDirty(false);
      router.refresh();
    } catch {
      setError("Save failed. Check your connection and retry.");
    } finally {
      setSaving("idle");
    }
  }

  const busy = saving === "saving";

  return (
    <section className="rounded-card border border-navy/15 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className={`${label} text-navy/55`}>Test settings</h2>
        <span className="font-mono text-[13px] text-navy/45">{test.slug}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field labelText="Title" className="sm:col-span-2">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              touch();
            }}
            className={inputClass}
          />
        </Field>

        <Field labelText="Break between sections (minutes)">
          <input
            type="number"
            min={0}
            max={60}
            value={breakMinutes}
            onChange={(e) => {
              setBreakMinutes(e.target.value);
              touch();
            }}
            className={inputClass}
          />
        </Field>

        <div />

        <Field labelText="Publication status" hint="Draft tests remain available to admins for QA but are hidden from students.">
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value === "published" ? "published" : "draft");
              touch();
            }}
            className={inputClass}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </Field>

        <div />

        <Field labelText="R&W → hard Module 2 threshold" hint="Fraction of R&W Module 1 correct to route into the hard Module 2 (e.g. 0.67 ≈ two-thirds).">
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={rwThreshold}
            onChange={(e) => {
              setRwThreshold(e.target.value);
              touch();
            }}
            className={inputClass}
          />
        </Field>

        <Field labelText="Math → hard Module 2 threshold" hint="Fraction of Math Module 1 correct to route into the hard Module 2 (e.g. 0.64).">
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={mathThreshold}
            onChange={(e) => {
              setMathThreshold(e.target.value);
              touch();
            }}
            className={inputClass}
          />
        </Field>
      </div>

      <p className="mt-4 rounded-[10px] bg-gold/[0.08] px-3 py-2 text-[12px] leading-relaxed text-navy/60">
        {status === "published" ? "Changes apply to future attempts once saved." : "This draft is hidden from students and remains available to admins for QA."} Saved reports remain bound to the test version captured when each attempt was completed.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-navy/10 pt-4">
        {dirty ? <span className="text-[12px] font-medium text-gold-600">Unsaved changes</span> : null}
        {error ? <span className="text-[12px] font-medium text-danger">{error}</span> : null}
        <div className="ml-auto">
          <button type="button" onClick={onSave} disabled={busy || !dirty} className={primaryBtn}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({
  labelText,
  hint,
  className,
  children,
}: {
  labelText: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <span className={`${label} mb-1.5 block text-navy/55`}>{labelText}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] leading-snug text-navy/45">{hint}</span> : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-[10px] border-[1.5px] border-navy/[0.18] bg-white px-[13px] py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15";
