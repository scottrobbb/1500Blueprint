"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { UpgradePrompt } from "@/components/account/UpgradePrompt";
import type { PlanCode } from "@/lib/auth/plans";
import {
  MATH_DOMAINS,
  skillMetricForDifficulty,
  type MathBankCatalog,
  type MathCompletionFilter,
  type MathDifficultyFilter,
  type MathSkillMetric,
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
  const [difficulty, setDifficulty] = useState<MathDifficultyFilter>("all");
  const [completion, setCompletion] = useState<MathCompletionFilter>("all");
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(() => new Set());

  const selectedAvailable = useMemo(
    () => catalog.skills.reduce(
      (total, skill) => total + (selectedSkills.has(skill.name) ? skillMetricForDifficulty(skill, difficulty).available : 0),
      0,
    ),
    [catalog.skills, selectedSkills, difficulty],
  );
  const totalAvailable = difficulty === "all"
    ? catalog.totalAvailable
    : catalog.skills.reduce((total, skill) => total + skillMetricForDifficulty(skill, difficulty).available, 0);
  const practiceHref = buildPracticeHref(basePath, difficulty, completion, [...selectedSkills]);
  const allPracticeHref = buildPracticeHref(basePath, difficulty, completion, []);

  function toggleSkill(name: string) {
    setSelectedSkills((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="min-h-dvh bg-[#f5f6f8]">
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
          <UpgradePrompt currentPlan={currentPlan} requiredPlan="core" title="Challenge questions are locked" description={`Your Free ${subjectTitle} bank stays available. Core adds Scott's hardest transfer sets when you are ready for less predictable questions.`} features={["Challenge-level questions", "3,000 included submissions", "Daily drills"]} className="mt-6" />
        ) : null}

        <section aria-label="Practice filters" className="mt-7 flex flex-wrap gap-3">
          <FilterSelect
            label="Difficulty"
            value={difficulty}
            onChange={(value) => setDifficulty(value as MathDifficultyFilter)}
            options={[
              ["all", "All difficulties"],
              ["easy", "Easy"],
              ["medium", "Medium"],
              ["hard", "Hard"],
            ]}
          />
          <FilterSelect
            label="Completion"
            value={completion}
            onChange={(value) => setCompletion(value as MathCompletionFilter)}
            options={[
              ["all", "All questions"],
              ["unanswered", "Not attempted"],
              ["attempted", "Attempted"],
            ]}
          />
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

        <section className="mt-5 overflow-hidden rounded-[18px] border border-brand/20 bg-[linear-gradient(115deg,#eaf7ff_0%,#f8fbff_62%,#fff7da_100%)] p-5 shadow-pop sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand-600">Complete bank</p>
            <h2 className="mt-1 font-display text-xl font-extrabold text-navy">Practice all {subjectTitle} topics</h2>
            <p className="mt-1 text-sm leading-5 text-navy/50">
              Start across all {skillCount} skills. Your active difficulty and completion filters still apply.
            </p>
          </div>
          {catalog.totalAvailable > 0 ? (
            <Link
              href={allPracticeHref}
              prefetch={false}
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-sm font-extrabold text-white transition-colors hover:bg-[#15396d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:mt-0"
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
                    {skills.reduce((total, skill) => total + skillMetricForDifficulty(skill, difficulty).available, 0)} questions
                  </span>
                </div>
                <ul className="space-y-2">
                  {skills.map((skill) => (
                    <SkillRow
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
  checked,
  onToggle,
}: {
  skill: BankSkillMetric;
  difficulty: MathDifficultyFilter;
  checked: boolean;
  onToggle: () => void;
}) {
  const view = skillMetricForDifficulty(skill, difficulty);
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
            disabled={skill.available === 0}
            className="mt-0.5 h-5 w-5 flex-none accent-[#169bd5]"
          />
          <span>
            <span className="block text-sm font-bold leading-5 text-navy sm:text-[15px]">{skill.name}</span>
            {skill.available === 0 ? (
              <span className="mt-1 block text-xs font-semibold text-navy/35">Content queued</span>
            ) : view.available === 0 ? (
              <span className="mt-1 block text-xs font-semibold text-navy/35">No {difficulty} questions yet</span>
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
): string {
  const params = new URLSearchParams();
  if (difficulty !== "all") params.set("difficulty", difficulty);
  if (completion !== "all") params.set("completion", completion);
  if (skills.length > 0) params.set("skills", skills.join("|"));
  const query = params.toString();
  return `${basePath}/practice${query ? `?${query}` : ""}`;
}

function accuracyTone(accuracy: number | null): string {
  if (accuracy == null) return "bg-navy/20";
  if (accuracy >= 85) return "bg-[#16a36a]";
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

function ChevronDownIcon({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
