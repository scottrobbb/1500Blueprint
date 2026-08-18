"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import {
  administeredModules,
  analyzeModule,
  buildPerformanceSummary,
  type AdministeredModule,
  type BreakdownRow,
} from "@/lib/sat/results";
import type { TestResult } from "@/lib/sat/scoring";
import { formatTime } from "@/lib/sat/testState";
import type { AnswerMap, ModuleVariant, PracticeTest, SectionId } from "@/lib/sat/types";
import { AnswerReviewDashboard } from "./AnswerReviewDashboard";
import { ArrowRightIcon, CheckIcon } from "./icons";
import { ScoreShareModal } from "./ScoreShareModal";

export type AttemptSaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  test: PracticeTest;
  result: TestResult;
  routed: Partial<Record<SectionId, ModuleVariant>>;
  answers: AnswerMap;
  perQuestionTime: Record<string, number>;
  onRestart?: () => void;
  backHref?: string;
  attemptDate?: string;
  savedHref?: string;
  attemptsHref?: string;
  completedHref?: string;
  testsHref?: string;
  backLabel?: string;
  saveStatus?: AttemptSaveStatus;
  onRetrySave?: () => void;
};

const OVERVIEW = "overview";

export function ResultsScreen({
  test,
  result,
  routed,
  answers,
  perQuestionTime,
  onRestart,
  backHref,
  attemptDate,
  savedHref,
  attemptsHref,
  completedHref = "/practice-test/completed",
  testsHref = "/practice-test",
  backLabel = "Back to your attempts",
  saveStatus,
  onRetrySave,
}: Props) {
  const modules = useMemo(() => administeredModules(test, routed), [test, routed]);
  const summary = useMemo(
    () => buildPerformanceSummary(test, routed, answers, perQuestionTime),
    [test, routed, answers, perQuestionTime],
  );
  const [activeKey, setActiveKey] = useState(OVERVIEW);
  const [reviewModule, setReviewModule] = useState<AdministeredModule>();
  const [shareOpen, setShareOpen] = useState(false);
  const activeModule = modules.find((module) => module.key === activeKey);
  const rwScore = result.sections.find((section) => section.sectionId === "rw")?.scaled ?? 200;
  const mathScore = result.sections.find((section) => section.sectionId === "math")?.scaled ?? 200;

  if (reviewModule) {
    return (
      <AnswerReviewDashboard
        label={reviewModule.label}
        section={reviewModule.section}
        module={reviewModule.module}
        answers={answers}
        perQuestionTime={perQuestionTime}
        onBack={() => setReviewModule(undefined)}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50 text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={completedHref}
              className="hidden min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink sm:inline-flex"
            >
              Completed tests
            </Link>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white transition-colors hover:bg-navy"
            >
              <ShareIcon className="h-4 w-4" />
              Share score
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-blue-200 bg-gradient-to-br from-[#eaf3ff] via-[#f4f8ff] to-white">
        <div className="mx-auto grid max-w-6xl gap-7 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:py-10">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-600">Practice test results</p>
            <h1 className="mt-2 font-display text-2xl font-black tracking-tight text-navy sm:text-3xl">{test.title}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {attemptDate ? `Taken ${attemptDate}` : "Your complete score report is ready."}
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-blue-200 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
            <ScoreStat label="Reading & Writing" value={rwScore} />
            <ScoreStat label="Math" value={mathScore} />
            <ScoreStat label="Total" value={result.total} featured />
          </div>
        </div>
      </section>

      <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur" aria-label="Result sections">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          <ResultTab active={activeKey === OVERVIEW} onClick={() => setActiveKey(OVERVIEW)}>
            Test overview
          </ResultTab>
          {modules.map((module) => (
            <ResultTab key={module.key} active={activeKey === module.key} onClick={() => setActiveKey(module.key)}>
              <span className="sm:hidden">{module.shortLabel}</span>
              <span className="hidden sm:inline">{module.label}</span>
            </ResultTab>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        {saveStatus && saveStatus !== "idle" ? (
          <AttemptSaveNotice status={saveStatus} attemptsHref={attemptsHref} onRetry={onRetrySave} />
        ) : null}

        {activeModule ? (
          <ModuleReport
            administered={activeModule}
            answers={answers}
            perQuestionTime={perQuestionTime}
            onReview={() => setReviewModule(activeModule)}
          />
        ) : (
          <Overview
            summary={summary}
            result={result}
            test={test}
            modules={modules}
            answers={answers}
            perQuestionTime={perQuestionTime}
            onSelectModule={setActiveKey}
          />
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 border-t border-slate-200 pt-7">
          {onRestart ? (
            <button
              type="button"
              onClick={onRestart}
              className="min-h-11 cursor-pointer rounded-lg bg-brand-600 px-5 text-sm font-bold text-white transition-colors hover:bg-navy"
            >
              Retake practice test
            </button>
          ) : null}
          {savedHref ? <ActionLink href={savedHref}>View saved report</ActionLink> : null}
          {attemptsHref ? <ActionLink href={attemptsHref}>View past attempts</ActionLink> : null}
          {backHref ? <ActionLink href={backHref}>{backLabel}</ActionLink> : null}
          <ActionLink href={testsHref}>All practice tests</ActionLink>
        </div>
      </div>

      <ScoreShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        testTitle={test.title}
        dateLabel={attemptDate}
        total={result.total}
        rwScore={rwScore}
        mathScore={mathScore}
      />
    </main>
  );
}

function Overview({
  summary,
  result,
  test,
  modules,
  answers,
  perQuestionTime,
  onSelectModule,
}: {
  summary: ReturnType<typeof buildPerformanceSummary>;
  result: TestResult;
  test: PracticeTest;
  modules: AdministeredModule[];
  answers: AnswerMap;
  perQuestionTime: Record<string, number>;
  onSelectModule: (key: string) => void;
}) {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-gradient-to-br from-[#143d91] to-[#2979dc] p-6 text-white sm:p-8">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-200">Personalized performance summary</p>
            <h2 className="mt-3 font-display text-2xl font-black leading-tight">{summary.heading}</h2>
            <p className="mt-4 text-sm leading-6 text-blue-50">{summary.body}</p>
          </div>
          <div className="p-6 sm:p-8">
            <h3 className="font-display text-lg font-extrabold text-navy">Your next steps</h3>
            <ol className="mt-4 space-y-4">
              {summary.nextSteps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-black text-brand-600">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Score breakdown</p>
            <h2 className="mt-1 font-display text-xl font-black text-navy">Section performance</h2>
          </div>
          <p className="hidden text-xs text-slate-500 sm:block">Select a module for detailed analytics.</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {result.sections.map((sectionResult) => {
            const section = test.sections.find((item) => item.id === sectionResult.sectionId);
            const percent = sectionResult.total ? Math.round((sectionResult.raw / sectionResult.total) * 100) : 0;
            return (
              <article key={sectionResult.sectionId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-base font-extrabold text-ink">{section?.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">Module 2 route: <span className="font-bold capitalize text-brand-600">{sectionResult.variant}</span></p>
                  </div>
                  <p className="font-display text-3xl font-black text-navy">{sectionResult.scaled}</p>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="w-20 text-right text-xs font-bold text-slate-600">{sectionResult.raw}/{sectionResult.total} correct</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-black text-navy">Module details</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((module) => {
            const analytics = analyzeModule(module.section.id, module.module, answers, perQuestionTime);
            return (
              <button
                type="button"
                key={module.key}
                onClick={() => onSelectModule(module.key)}
                className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-extrabold text-ink">{module.shortLabel}</p>
                  <ArrowRightIcon className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </div>
                <p className="mt-4 font-display text-2xl font-black text-navy">{analytics.accuracy}%</p>
                <p className="mt-1 text-xs text-slate-500">{analytics.correct}/{analytics.total} correct · {formatTime(analytics.timeSeconds)}</p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ModuleReport({
  administered,
  answers,
  perQuestionTime,
  onReview,
}: {
  administered: AdministeredModule;
  answers: AnswerMap;
  perQuestionTime: Record<string, number>;
  onReview: () => void;
}) {
  const analytics = analyzeModule(administered.section.id, administered.module, answers, perQuestionTime);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Detailed result</p>
          <h2 className="mt-1 font-display text-2xl font-black text-navy">{administered.label}</h2>
        </div>
        <button
          type="button"
          onClick={onReview}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-bold text-white transition-colors hover:bg-navy"
        >
          View your answers
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>

      <section className="mt-5 grid overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm sm:grid-cols-3">
        <Metric label="Questions correct" value={`${analytics.correct}/${analytics.total}`} />
        <Metric label="Accuracy" value={`${analytics.accuracy}%`} />
        <Metric label="Time spent" value={formatTime(analytics.timeSeconds)} />
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <BreakdownCard title="By difficulty" rows={analytics.byDifficulty} />
        <BreakdownCard title="By subject" rows={analytics.bySubject} />
        <BreakdownCard title="By topic" rows={analytics.byTopic} />
      </div>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-display text-base font-extrabold text-navy">{title}</h3>
      <div className="mt-5 space-y-5">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-2 flex items-start justify-between gap-3 text-xs">
              <span className="font-semibold capitalize leading-4 text-slate-700">{row.label}</span>
              <span className="shrink-0 font-bold text-slate-500">{row.correct}/{row.total} · {row.accuracy}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-blue-50" aria-label={`${row.label}: ${row.accuracy}%`}>
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${row.accuracy}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-slate-500">No questions in this category.</p> : null}
      </div>
    </section>
  );
}

function ScoreStat({ label, value, featured = false }: { label: string; value: number; featured?: boolean }) {
  return (
    <div className={`min-w-24 px-3 py-4 text-center sm:min-w-32 sm:px-5 ${featured ? "bg-blue-50" : ""}`}>
      <p className="text-[10px] font-bold leading-tight text-slate-500 sm:text-xs">{label}</p>
      <p className={`mt-1 font-display text-2xl font-black sm:text-3xl ${featured ? "text-brand-600" : "text-navy"}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-blue-100 p-6 text-center last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 font-display text-3xl font-black text-navy">{value}</p>
    </div>
  );
}

function ResultTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`min-h-12 shrink-0 cursor-pointer border-b-2 px-3 text-xs font-bold transition-colors sm:px-4 sm:text-sm ${
        active ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition-colors hover:border-brand-600 hover:text-brand-600">
      {children}
    </Link>
  );
}

function AttemptSaveNotice({
  status,
  attemptsHref,
  onRetry,
}: {
  status: AttemptSaveStatus;
  attemptsHref?: string;
  onRetry?: () => void;
}) {
  if (status === "error") {
    return (
      <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <span>This attempt was not saved. Keep this page open and try again.</span>
        <button type="button" onClick={onRetry} className="min-h-11 cursor-pointer rounded-lg bg-red-700 px-4 font-semibold text-white transition-colors hover:bg-red-800">
          Retry save
        </button>
      </div>
    );
  }
  if (status === "saved") {
    return (
      <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <span className="inline-flex items-center gap-2"><CheckIcon className="h-4 w-4" />Your attempt and detailed answers are saved.</span>
        {attemptsHref ? <Link href={attemptsHref} className="font-semibold underline underline-offset-2">View past attempts</Link> : null}
      </div>
    );
  }
  return <div role="status" className="mb-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-brand-600">Saving your attempt…</div>;
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.3 10.9l7.4-4.4M8.3 13.1l7.4 4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
