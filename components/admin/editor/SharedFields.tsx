"use client";

import type { DrillQuestion } from "@/lib/drills/types";
import { label } from "@/components/drills/shared/ui";
import { FigureUploadField } from "@/components/admin/editor/FigureUploadField";

// Editor fields owned by the shared shell (not the per-drill Fields editors):
// the question's stem, passage/context, figure URL, and explanation. Every
// drill reuses these, so they live here once and write straight onto the
// question via onChange. Drill-specific content (choices, accepted answers) is
// edited by each drill's own Fields component.

type Props = {
  question: DrillQuestion;
  onChange: (patch: Partial<DrillQuestion>) => void;
};

// 1.5px hairline border + brand focus ring, matching ExplainInput's textarea so
// the admin forms read as the same family as the student-facing drills.
const fieldClass =
  "w-full rounded-[10px] border-[1.5px] border-navy/[0.18] p-[11px_13px] text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15";

function Field({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={`${label} text-navy/55`}>{title}</span>
      {children}
      <span className="mt-1 block text-[12px] leading-snug text-navy/45">{helper}</span>
    </label>
  );
}

export function SharedFields({ question, onChange }: Props) {
  return (
    <div className="space-y-5">
      <Field title="Stem" helper="The question prompt students read. Inline math goes in $...$.">
        <textarea
          value={question.stem ?? ""}
          onChange={(e) => onChange({ stem: e.target.value || null })}
          rows={3}
          placeholder="Which choice completes the text so that it conforms to the conventions of Standard English?"
          className={`mt-1.5 min-h-[80px] resize-y ${fieldClass}`}
        />
      </Field>

      <Field
        title="Passage / Context"
        helper="Optional supporting passage or setup shown above the question."
      >
        <textarea
          value={question.passage ?? ""}
          onChange={(e) => onChange({ passage: e.target.value || null })}
          rows={4}
          placeholder="Paste the passage or context the student reads before answering."
          className={`mt-1.5 min-h-[110px] resize-y ${fieldClass}`}
        />
      </Field>

      <FigureUploadField
        value={question.figureUrl ?? ""}
        onChange={(figureUrl) => onChange({ figureUrl: figureUrl || null })}
      />

      <Field
        title="Explanation"
        helper="Shown after the student answers. Explain the correct choice and why the others are wrong."
      >
        <textarea
          value={question.explanation ?? ""}
          onChange={(e) => onChange({ explanation: e.target.value || null })}
          rows={4}
          placeholder="The correct answer is ... because ..."
          className={`mt-1.5 min-h-[110px] resize-y ${fieldClass}`}
        />
      </Field>
    </div>
  );
}
