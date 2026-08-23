"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CompletedTestAttempt } from "@/lib/gamification/state";
import { ArrowRightIcon } from "./icons";
import { ScoreShareModal } from "./ScoreShareModal";

type Props = {
  attempts: CompletedTestAttempt[];
  testTitles: Record<string, string>;
  variant?: "default" | "ultimate";
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

function scoreChange(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value}`;
}

export function CompletedTestsDashboard({ attempts, testTitles, variant = "default" }: Props) {
  const isUltimate = variant === "ultimate";
  const testsHref = isUltimate ? "/ultimate/tests" : "/practice-test";
  const reportQuery = isUltimate ? "?workspace=ultimate" : "";
  const scored = attempts.filter(
    (attempt): attempt is CompletedTestAttempt & { totalScore: number } => typeof attempt.totalScore === "number",
  );
  const latest = scored.at(-1);
  const previous = scored.at(-2);
  const highest = scored.length ? Math.max(...scored.map((attempt) => attempt.totalScore)) : null;
  const totalImprovement = latest && scored[0] ? latest.totalScore - scored[0].totalScore : null;
  const recentChange = latest && previous ? latest.totalScore - previous.totalScore : null;
  const newestFirst = [...attempts].reverse();
  const [shareAttemptId, setShareAttemptId] = useState<string>();
  const shareAttempt = attempts.find((attempt) => attempt.id === shareAttemptId);
  const shareTitle = shareAttempt ? shareAttempt.testTitle ?? testTitles[shareAttempt.testSlug] ?? shareAttempt.testSlug : "Practice Test";

  return (
    <>
      <section className={isUltimate ? "overflow-hidden rounded-[18px] border border-navy/10 bg-gradient-to-br from-navy via-navy-700 to-[#2454ad] shadow-pop" : "border-b border-blue-200 bg-gradient-to-br from-[#eaf3ff] via-[#f6f9ff] to-white"}>
        <div className={isUltimate ? "px-6 py-8 sm:px-8 sm:py-9" : "mx-auto max-w-[1100px] px-5 py-9 sm:px-6 sm:py-11"}>
          <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${isUltimate ? "text-sky" : "text-brand-600"}`}>Performance history</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className={`font-display text-3xl font-black tracking-tight sm:text-4xl ${isUltimate ? "text-white" : "text-navy"}`}>Completed Tests</h1>
              <p className={`mt-2 max-w-xl text-sm leading-6 ${isUltimate ? "text-white/70" : "text-slate-600"}`}>Track your score trajectory, revisit detailed reports, and share your progress.</p>
            </div>
            <Link href={testsHref} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors ${isUltimate ? "bg-white text-navy hover:bg-sky" : "bg-brand-600 text-white hover:bg-navy"}`}>
              Take another test
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className={isUltimate ? "py-6" : "mx-auto max-w-[1100px] px-5 py-7 sm:px-6 sm:py-10"}>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Testing highlights">
          <KpiCard label="Latest score" value={latest?.totalScore ?? null} detail={latest ? dateFormatter.format(new Date(latest.createdAt)) : "Complete a test to begin"} />
          <KpiCard label="Highest score" value={highest} detail={highest == null ? "No score yet" : "Your personal best"} />
          <KpiCard label="Total improvement" value={scoreChange(totalImprovement)} detail={scored.length > 1 ? "First to latest test" : "Take two tests to compare"} accent={totalImprovement != null && totalImprovement > 0} />
          <KpiCard label="Recent change" value={scoreChange(recentChange)} detail={recentChange == null ? "Take two tests to compare" : "Compared with your prior test"} accent={recentChange != null && recentChange > 0} />
        </section>

        {scored.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Score trajectory</p>
                <h2 className="mt-1 font-display text-xl font-black text-navy">Your progress over time</h2>
              </div>
              <p className="text-xs text-slate-500">{scored.length} completed {scored.length === 1 ? "test" : "tests"}</p>
            </div>
            <ScoreTrend attempts={scored} />
          </section>
        ) : null}

        <section className="mt-8">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-black text-navy">Test history</h2>
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold text-slate-500">{attempts.length} total</span>
          </div>

          {newestFirst.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 p-10 text-center">
              <h3 className="font-display text-xl font-extrabold text-navy">Your first score will appear here.</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Complete a full-length practice test to unlock score trends and detailed module analytics.</p>
              <Link href={testsHref} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-bold text-white hover:bg-navy">Choose a practice test</Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {newestFirst.map((attempt, index) => {
                const title = attempt.testTitle ?? testTitles[attempt.testSlug] ?? attempt.testSlug;
                const prior = attempts[attempts.findIndex((item) => item.id === attempt.id) - 1];
                const change =
                  typeof attempt.totalScore === "number" && typeof prior?.totalScore === "number"
                    ? attempt.totalScore - prior.totalScore
                    : null;
                return (
                  <article key={attempt.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-blue-100 bg-blue-50/70 px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-extrabold text-navy">{title}</p>
                        {index === 0 ? <span className="rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">Latest</span> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{dateFormatter.format(new Date(attempt.createdAt))}</p>
                    </div>
                    <div className="p-5">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Total score</p>
                          <div className="mt-1 flex items-baseline gap-2">
                            <p className="font-display text-4xl font-black text-navy">{attempt.totalScore ?? "—"}</p>
                            {change != null ? <span className={`text-xs font-extrabold ${change >= 0 ? "text-brand-600" : "text-slate-500"}`}>{scoreChange(change)}</span> : null}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-slate-200 text-center">
                          <SmallScore label="R&W" value={attempt.rwScore} />
                          <SmallScore label="Math" value={attempt.mathScore} />
                        </div>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <Link href={`/practice-test/${attempt.testSlug}/results/${attempt.id}${reportQuery}`} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 text-sm font-bold text-white transition-colors hover:bg-navy">
                          View report
                          <ArrowRightIcon className="h-4 w-4" />
                        </Link>
                        <button type="button" onClick={() => setShareAttemptId(attempt.id)} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition-colors hover:border-brand-600 hover:text-brand-600">Share score</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ScoreShareModal
        open={Boolean(shareAttempt)}
        onClose={() => setShareAttemptId(undefined)}
        testTitle={shareTitle}
        dateLabel={shareAttempt ? dateFormatter.format(new Date(shareAttempt.createdAt)) : undefined}
        total={shareAttempt?.totalScore ?? 400}
        rwScore={shareAttempt?.rwScore ?? 200}
        mathScore={shareAttempt?.mathScore ?? 200}
      />
    </>
  );
}

function KpiCard({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: number | string | null;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-2 font-display text-3xl font-black ${accent ? "text-brand-600" : "text-navy"}`}>{value ?? "—"}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function SmallScore({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-16 px-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-display text-lg font-black text-ink">{value ?? "—"}</p>
    </div>
  );
}

function ScoreTrend({
  attempts,
}: {
  attempts: Array<CompletedTestAttempt & { totalScore: number }>;
}) {
  const points = useMemo(() => {
    const scores = attempts.map((attempt) => attempt.totalScore);
    const minimum = Math.max(400, Math.floor((Math.min(...scores) - 100) / 100) * 100);
    const maximum = Math.min(1600, Math.ceil((Math.max(...scores) + 100) / 100) * 100);
    const range = Math.max(100, maximum - minimum);
    return attempts.map((attempt, index) => ({
      x: attempts.length === 1 ? 350 : 34 + (index / (attempts.length - 1)) * 632,
      y: 160 - ((attempt.totalScore - minimum) / range) * 124,
      attempt,
    }));
  }, [attempts]);
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox="0 0 700 200" role="img" aria-label="Total SAT scores by completed test" className="min-w-[620px]">
        {[36, 78, 119, 160].map((y) => <line key={y} x1="34" x2="666" y1={y} y2={y} stroke="#dbeafe" strokeWidth="1" />)}
        {points.length > 1 ? <polyline points={path} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((point, index) => (
          <g key={point.attempt.id}>
            <circle cx={point.x} cy={point.y} r="6" fill="#fff" stroke="#2563eb" strokeWidth="4" />
            <text x={point.x} y={point.y - 14} textAnchor="middle" fontSize="12" fontWeight="800" fill="#0f2e67">{point.attempt.totalScore}</text>
            <text x={point.x} y="187" textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b">Test {index + 1}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
