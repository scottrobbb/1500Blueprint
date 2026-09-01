"use client";

import type {
  AnswerType,
  DrillQuestion,
  SatSection,
  SatSkill,
} from "@/lib/drills/types";
import type { Difficulty } from "@/lib/sat/types";
import { isQuestionBankEligibleShape } from "@/lib/question-bank/eligibility";
import { label } from "@/components/drills/shared/ui";

export type MetadataPanelProps = {
  question: DrillQuestion;
  skills: SatSkill[];
  answerTypes: AnswerType[];
  onChange: (patch: Partial<DrillQuestion>) => void;
};

const SECTIONS: { value: SatSection; label: string }[] = [
  { value: "rw", label: "Reading & Writing" },
  { value: "math", label: "Math" },
];

// Question-bank questions carry the Challenge tier; practice-test questions do
// not (see TestQuestionEditor, which stays three-valued).
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "challenge"];

// Human labels for the DB answer-type enum (drills constrain which apply).
const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  mc_single: "Multiple choice",
  grid_in: "Grid-in",
  multi_select: "Multi-select",
  free_text: "Free text",
  spaced_repetition: "Spaced repetition",
};

// Sentinel for the empty option in nullable selects (HTML <option> values are
// strings, so we map "" <-> null at the boundary).
const NONE = "";

export function MetadataPanel({ question, skills, answerTypes, onChange }: MetadataPanelProps) {
  const section = question.section;
  const bankEligible = isQuestionBankEligibleShape(question);

  // Distinct domains for the chosen section, in taxonomy sort order.
  const domains = section ? distinctDomains(skills, section) : [];

  // Skills within the chosen section + domain.
  const sectionSkills =
    section && question.domain
      ? skills
          .filter((s) => s.section === section && s.domain === question.domain)
          .sort((a, b) => a.sort - b.sort)
      : [];

  return (
    <section className="rounded-card border border-navy/15 bg-white">
      <header className="border-b border-navy/10 px-4 py-3">
        <h2 className={`${label} text-navy/55`}>Question Metadata</h2>
      </header>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <Field id="meta-section" labelText="Section">
          <Select
            id="meta-section"
            value={section ?? NONE}
            onChange={(v) => {
              // Changing section invalidates the dependent domain + skill.
              const nextSection = (v as SatSection) || null;
              onChange({
                section: nextSection,
                domain: null,
                skill: null,
                ...(!isQuestionBankEligibleShape({ ...question, section: nextSection })
                  ? { includeInQuestionBank: false }
                  : {}),
              });
            }}
          >
            <option value={NONE}>None</option>
            {SECTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="meta-domain" labelText="Domain">
          <Select
            id="meta-domain"
            value={question.domain ?? NONE}
            disabled={!section}
            onChange={(v) => onChange({ domain: v || null, skill: null })}
          >
            <option value={NONE}>None</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="meta-skill" labelText="Skill" className="sm:col-span-2">
          <Select
            id="meta-skill"
            value={question.skill ?? NONE}
            disabled={!question.domain}
            onChange={(v) => onChange({ skill: v || null })}
          >
            <option value={NONE}>None</option>
            {sectionSkills.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="meta-difficulty" labelText="Difficulty">
          <Select
            id="meta-difficulty"
            value={question.difficulty}
            onChange={(v) => onChange({ difficulty: v as Difficulty })}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {capitalize(d)}
              </option>
            ))}
          </Select>
        </Field>

        {question.drillSlug === "targeted-math" ? null : (
          <Field id="meta-answer-type" labelText="Answer type">
            <Select
              id="meta-answer-type"
              value={question.answerType}
              onChange={(v) => {
                const answerType = v as AnswerType;
                onChange({
                  answerType,
                  ...(!isQuestionBankEligibleShape({ ...question, answerType })
                    ? { includeInQuestionBank: false }
                    : {}),
                });
              }}
            >
              {answerTypes.map((t) => (
                <option key={t} value={t}>
                  {ANSWER_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field id="meta-status" labelText="Status" className="sm:col-span-2">
          <Select
            id="meta-status"
            value={question.status}
            onChange={(v) => onChange({ status: v as DrillQuestion["status"] })}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <label htmlFor="meta-question-bank" className={`flex min-h-11 items-start gap-3 rounded-xl border border-navy/15 bg-mist/35 px-3.5 py-3 focus-within:ring-2 focus-within:ring-brand/20 ${bankEligible ? "cursor-pointer" : "cursor-not-allowed opacity-65"}`}>
            <input
              id="meta-question-bank"
              type="checkbox"
              checked={bankEligible && question.includeInQuestionBank}
              disabled={!bankEligible}
              onChange={(event) => onChange({ includeInQuestionBank: event.target.checked })}
              className="mt-0.5 h-4 w-4 flex-none accent-brand"
            />
            <span>
              <span className={`${label} block text-navy/70`}>Include in Question Bank</span>
              <span className="mt-1 block text-[12px] leading-5 text-navy/45">
                {bankEligible
                  ? "Published questions become available to students. Turning this off keeps prior attempt analytics."
                  : "Question Bank items must be single-choice Grammar (Reading & Writing) or single-choice/grid-in Targeted Math questions."}
              </span>
            </span>
          </label>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="meta-free-tier" className={`flex min-h-11 items-start gap-3 rounded-xl border border-navy/15 bg-mist/35 px-3.5 py-3 focus-within:ring-2 focus-within:ring-brand/20 ${bankEligible && question.includeInQuestionBank ? "cursor-pointer" : "cursor-not-allowed opacity-65"}`}>
            <input
              id="meta-free-tier"
              type="checkbox"
              checked={bankEligible && question.includeInQuestionBank && question.questionBankFreeTier}
              disabled={!bankEligible || !question.includeInQuestionBank}
              onChange={(event) => onChange({ questionBankFreeTier: event.target.checked })}
              className="mt-0.5 h-4 w-4 flex-none accent-brand"
            />
            <span>
              <span className={`${label} block text-navy/70`}>Free tier</span>
              <span className="mt-1 block text-[12px] leading-5 text-navy/45">
                Included in the Free plan&apos;s 200-question pool. Leave off to keep this Core/Max only.
              </span>
            </span>
          </label>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="meta-visible-in-drill" className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-navy/15 bg-mist/35 px-3.5 py-3 focus-within:ring-2 focus-within:ring-brand/20">
            <input
              id="meta-visible-in-drill"
              type="checkbox"
              checked={question.visibleInDrill}
              onChange={(event) => onChange({ visibleInDrill: event.target.checked })}
              className="mt-0.5 h-4 w-4 flex-none accent-brand"
            />
            <span>
              <span className={`${label} block text-navy/70`}>Also show in standalone Drills</span>
              <span className="mt-1 block text-[12px] leading-5 text-navy/45">
                Published questions still appear in their own drill&apos;s practice pool (e.g. Targeted Math Practice). Turn off to keep this Question Bank-only.
              </span>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}

// ---- Local primitives -----------------------------------------------------

function Field({
  id,
  labelText,
  className,
  children,
}: {
  id: string;
  labelText: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={`${label} mb-1.5 block text-navy/55`}>
        {labelText}
      </label>
      {children}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-[10px] border-[1.5px] border-navy/[0.18] bg-white px-[13px] py-2.5 pr-9 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-navy/5 disabled:text-navy/35"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/40" />
    </div>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- Helpers --------------------------------------------------------------

function distinctDomains(skills: SatSkill[], section: SatSection): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    if (s.section !== section || seen.has(s.domain)) continue;
    seen.add(s.domain);
    out.push(s.domain);
  }
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
