"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { UpgradePrompt } from "@/components/account/UpgradePrompt";
import type { PlanCode } from "@/lib/auth/plans";
import {
  MATH_DOMAINS,
  QUESTION_BANK_LEVELS,
  difficultyFilterParam,
  skillMetricForDifficulty,
  type MathBankCatalog,
  type MathCompletionFilter,
  type MathDifficultyFilter,
  type QuestionOrder,
  type MathSkillMetric,
  type QuestionBankLevel,
} from "@/lib/question-bank/math";

export function MathBankCatalogView({ catalog, challengeLocked, currentPlan }: { catalog: MathBankCatalog; challengeLocked: boolean; currentPlan: PlanCode }) {
  return (
    <SubjectBankCatalogView
      catalog={catalog}
      domains={MATH_DOMAINS}
      subjectTitle="Math"
      skillCount={19}
      basePath="/ultimate/bank/math"
      challengeLocked={challengeLocked}
      currentPlan={currentPlan}
    />
  );
}

type BankSkillMetric = Omit<MathSkillMetric, "domain"> & { domain: string };
type BankCatalog = Omit<MathBankCatalog, "skills"> & { skills: BankSkillMetric[] };

export function SubjectBankCatalogView({
  catalog,
  domains,
  subjectTitle,
  skillCount,
  basePath,
  challengeLocked,
  currentPlan,
}: {
  catalog: BankCatalog;
  domains: readonly string[];
  subjectTitle: string;
  skillCount: number;
  basePath: string;
  challengeLocked: boolean;
  currentPlan: PlanCode;
}) {
  const [difficulty, setDifficulty] = useState<QuestionBankLevel[]>([]);
  const [completion, setCompletion] = useState<MathCompletionFilter>("all");
  // Marked-for-review is a toggle rather than another Completion option: a
  // marked question can be unanswered, answered, or still wrong, so the two
  // choices have to compose instead of replacing one another.
  const [order, setOrder] = useState<QuestionOrder>("normal");
  const [savedOnly, setSavedOnly] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(() => new Set());

  const selectedAvailable = useMemo(
    () => catalog.skills.reduce(
      (total, skill) => total + (selectedSkills.has(skill.name) ? skillMetricForDifficulty(skill, difficulty, savedOnly).available : 0),
      0,
    ),
    [catalog.skills, selectedSkills, difficulty, savedOnly],
  );
  // Marked narrows the pool exactly as difficulty does, so once either is on
  // the count has to be summed from the skills rather than read off the
  // catalog's unfiltered total.
  const totalAvailable = difficulty.length === 0 && !savedOnly
    ? catalog.totalAvailable
    : catalog.skills.reduce((total, skill) => total + skillMetricForDifficulty(skill, difficulty, savedOnly).available, 0);
  const practiceHref = buildPracticeHref(basePath, difficulty, completion, [...selectedSkills], savedOnly, order);
  const allPracticeHref = buildPracticeHref(basePath, difficulty, completion, [], savedOnly, order);

  function toggleSkill(name: string) {
    setSelectedSkills((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-7 sm:px-7 sm:py-10">
        <Link
          href="/ultimate/bank"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-navy/55 transition-colors hover:bg-white hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to Question Bank
        </Link>

        <header className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-brand-600">Question Bank</p>
            <h1 className="mt-1 font-display text-[34px] font-extrabold tracking-[-0.04em] text-ink sm:text-[42px]">
              {subjectTitle}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-navy/50">
              Choose one or more SAT skills, then work through the questions in a focused practice session.
            </p>
          </div>
          <div className="rounded-2xl border border-navy/10 bg-white px-4 py-3 text-right shadow-pop">
            <p className="font-display text-2xl font-extrabold text-navy">{totalAvailable}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy/40">questions available</p>
          </div>
        </header>

        {challengeLocked ? (
          <UpgradePrompt currentPlan={currentPlan} requiredPlan="max" title="The full Challenge library unlocks with Max" description={`Your Free ${subjectTitle} bank already includes a sample of Challenge questions. Max adds Scott's complete set of hardest transfer questions.`} features={["Full Challenge-level access", "Unlimited questions", "Unlimited daily drills"]} className="mt-6" />
        ) : null}

        <section aria-label="Practice filters" className="mt-7 flex flex-wrap gap-3">
          <FilterCheckboxGroup
            label="Difficulty"
            emptyLabel="All difficulties"
            selected={difficulty}
            options={[
              ["easy", "Easy"],
              ["medium", "Medium"],
              ["hard", "Hard"],
              ["challenge", "Challenge"],
            ]}
            onToggle={(level) => setDifficulty((current) => (
              current.includes(level)
                ? current.filter((value) => value !== level)
                : QUESTION_BANK_LEVELS.filter((value) => value === level || current.includes(value))
            ))}
            onClear={() => setDifficulty([])}
          />
          <FilterSelect
            label="Completion"
            value={completion}
            onChange={(value) => setCompletion(value as MathCompletionFilter)}
            options={[
              ["all", "All questions"],
              ["unanswered", "Not attempted"],
              ["attempted", "Attempted"],
              ["incorrect", "Still incorrect"],
            ]}
          />
          <FilterSelect
            label="Question order"
            value={order}
            onChange={(value) => setOrder(value as QuestionOrder)}
            options={[
              ["normal", "Normal order"],
              ["random", "Random order"],
            ]}
          />
          <button
            type="button"
            role="switch"
            aria-checked={savedOnly}
            onClick={() => setSavedOnly((current) => !current)}
            disabled={catalog.totalSaved === 0}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-45 ${
              savedOnly
                ? "border-brand bg-ice text-brand-600"
                : "border-navy/10 bg-white text-navy/55 hover:border-brand/30 hover:text-brand-600"
            }`}
          >
            <BookmarkIcon filled={savedOnly} className="h-4 w-4" />
            Marked for review
            <span className="tabular-nums font-extrabold">{catalog.totalSaved}</span>
          </button>
          {selectedSkills.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedSkills(new Set())}
              className="min-h-11 rounded-xl border border-navy/10 bg-white px-4 text-sm font-bold text-navy/55 transition-colors hover:border-brand/30 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Clear {selectedSkills.size} selected
            </button>
          )}
        </section>

        {/* The gradient is fixed artwork, so the type on it is pinned to the light
            palette. Without this, dark mode flips text-navy to near-white and the
            heading and description all but vanish against it. */}
        <section data-theme="light" className="mt-5 overflow-hidden rounded-[18px] border border-brand/20 bg-[linear-gradient(115deg,#eaf7ff_0%,#f8fbff_62%,#fff7da_100%)] p-5 shadow-pop sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
          <div>
            <h2 className="font-display text-xl font-extrabold text-navy">Practice all {subjectTitle} topics</h2>
            <p className="mt-1 text-sm leading-5 text-navy/50">
              Start across all {skillCount} skills. Your active difficulty{savedOnly ? ", marked" : ""} and completion filters still apply.
            </p>
          </div>
          {totalAvailable > 0 ? (
            <Link
              href={allPracticeHref}
              prefetch={false}
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-sm font-extrabold text-white transition-colors hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:mt-0"
            >
              Start all topics <ArrowRightIcon className="h-4 w-4" />
            </Link>
          ) : (
            <span className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-navy/10 px-5 text-sm font-bold text-navy/35 sm:mt-0">
              No questions yet
            </span>
          )}
        </section>

        <div className="mt-7 hidden grid-cols-[minmax(0,1fr)_220px_100px] gap-5 border-b border-navy/10 px-4 pb-3 text-[11px] font-bold uppercase tracking-[0.13em] text-navy/35 md:grid">
          <span>Topic</span>
          <span>Progress</span>
          <span>Accuracy</span>
        </div>

        <div className="divide-y divide-navy/10">
          {domains.map((domain) => {
            const skills = catalog.skills.filter((skill) => skill.domain === domain);
            return (
              <section key={domain} aria-labelledby={slug(domain)} className="py-7 first:pt-6">
                <div className="mb-3 flex items-center justify-between gap-4 px-1 sm:px-4">
                  <h2 id={slug(domain)} className="font-display text-xl font-extrabold tracking-[-0.02em] text-ink">
                    {domain}
                  </h2>
                  <span className="text-xs font-semibold text-navy/35">
                    {skills.reduce((total, skill) => total + skillMetricForDifficulty(skill, difficulty, savedOnly).available, 0)} questions
                  </span>
                </div>
                <ul className="space-y-2">
                  {skills.map((skill) => (
                    <SkillRow
                      savedOnly={savedOnly}
                      key={skill.name}
                      skill={skill}
                      difficulty={difficulty}
                      checked={selectedSkills.has(skill.name)}
                      onToggle={() => toggleSkill(skill.name)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {selectedSkills.size > 0 && (
        <div className="sticky bottom-0 z-20 border-t border-navy/10 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_-24px_rgba(12,35,72,0.5)] backdrop-blur sm:px-7">
          <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4">
            <p className="text-sm font-bold text-navy">
              {selectedSkills.size} {selectedSkills.size === 1 ? "skill" : "skills"} · {selectedAvailable} available
            </p>
            <Link
              href={practiceHref}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-extrabold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              Practice selected <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubjectBankCatalogView;

function SkillRow({
  skill,
  difficulty,
  savedOnly,
  checked,
  onToggle,
}: {
  skill: BankSkillMetric;
  difficulty: MathDifficultyFilter;
  savedOnly: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const view = skillMetricForDifficulty(skill, difficulty, savedOnly);
  const progress = view.available > 0 ? Math.round((view.attempted / view.available) * 100) : 0;

  return (
    <li>
      <label className={`grid min-h-[68px] cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition-colors md:grid-cols-[minmax(0,1fr)_220px_100px] md:items-center md:gap-5 ${
        checked
          ? "border-brand/35 bg-brand/[0.055]"
          : "border-transparent hover:border-navy/10 hover:bg-white"
      }`}>
        <span className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            disabled={view.available === 0}
            className="mt-0.5 h-5 w-5 flex-none accent-brand"
          />
          <span>
            <span className="block text-sm font-bold leading-5 text-navy sm:text-[15px]">{skill.name}</span>
            {skill.available === 0 ? (
              <span className="mt-1 block text-xs font-semibold text-navy/35">Content queued</span>
            ) : view.available === 0 ? (
              <span className="mt-1 block text-xs font-semibold text-navy/35">
                {savedOnly ? "Nothing marked here" : `No ${difficulty} questions yet`}
              </span>
            ) : null}
          </span>
        </span>
        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pl-8 md:pl-0">
          <span className="h-2 overflow-hidden rounded-full bg-navy/[0.07]" aria-label={`${progress}% complete`}>
            <span className="block h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
          </span>
          <span className="min-w-[60px] text-right text-xs font-semibold tabular-nums text-navy/50">
            {view.attempted}/{view.available}
          </span>
        </span>
        <span className="flex items-center gap-2 pl-8 text-sm font-extrabold tabular-nums text-navy md:pl-0">
          <span className={`h-2 w-2 rounded-full ${accuracyTone(view.accuracy)}`} />
          {view.accuracy == null ? "-" : `${view.accuracy}%`}
        </span>
      </label>
    </li>
  );
}

function FilterCheckboxGroup({
  label,
  emptyLabel,
  selected,
  options,
  onToggle,
  onClear,
}: {
  label: string;
  emptyLabel: string;
  selected: readonly QuestionBankLevel[];
  options: [QuestionBankLevel, string][];
  onToggle: (value: QuestionBankLevel) => void;
  onClear: () => void;
}) {
  // Nothing ticked means every level, so the summary says so rather than
  // reading as an empty selection that would return no questions.
  const summary = selected.length === 0
    ? emptyLabel
    : options.filter(([value]) => selected.includes(value)).map(([, text]) => text).join(", ");

  return (
    <fieldset className="rounded-xl border border-navy/10 bg-white px-4 py-2.5 shadow-sm">
      <legend className="sr-only">{label}</legend>
      <p aria-hidden="true" className="text-[11px] font-semibold text-navy/45">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {options.map(([value, text]) => (
          <label key={value} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold text-navy">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onToggle(value)}
              className="h-4 w-4 rounded border-navy/25 accent-brand"
            />
            {text}
          </label>
        ))}
        {selected.length > 0 ? (
          <button type="button" onClick={onClear} className="cursor-pointer text-xs font-bold text-brand-600 hover:text-brand">
            Clear
          </button>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">{label}: {summary}</p>
    </fieldset>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 appearance-none rounded-xl border border-navy/10 bg-white py-2 pl-4 pr-10 text-sm font-bold text-navy shadow-sm outline-none transition-colors hover:border-brand/30 focus:border-brand focus:ring-2 focus:ring-brand/15"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/40" />
    </label>
  );
}

function buildPracticeHref(
  basePath: string,
  difficulty: MathDifficultyFilter,
  completion: MathCompletionFilter,
  skills: string[],
  savedOnly: boolean,
  order: QuestionOrder,
): string {
  const params = new URLSearchParams();
  const difficultyParam = difficultyFilterParam(difficulty);
  if (difficultyParam) params.set("difficulty", difficultyParam);
  if (completion !== "all") params.set("completion", completion);
  if (savedOnly) params.set("saved", "1");
  if (skills.length > 0) params.set("skills", skills.join("|"));
  // No seed here: generating one during render would differ between the server
  // pass and hydration. The practice page deals it and redirects once.
  if (order === "random") params.set("order", "random");
  const query = params.toString();
  return `${basePath}/practice${query ? `?${query}` : ""}`;
}

function accuracyTone(accuracy: number | null): string {
  if (accuracy == null) return "bg-navy/20";
  if (accuracy >= 85) return "bg-success";
  if (accuracy >= 60) return "bg-gold";
  return "bg-flag";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

type IconProps = { className?: string };

function ArrowLeftIcon({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowRightIcon({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// The same mark the runner draws on a saved question, so the filter and the
// thing it filters on read as one feature.
function BookmarkIcon({ className, filled }: IconProps & { filled: boolean }) {
  return <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 4h10v16l-5-3-5 3V4Z" strokeLinejoin="round" /></svg>;
}

function ChevronDownIcon({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
