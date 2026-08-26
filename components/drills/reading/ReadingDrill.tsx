"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DrillShell } from "../shared/DrillShell";
import { DigitalTimer, StreakDots } from "../shared/Hud";
import { ExplainInput } from "../shared/ExplainInput";
import { GradingLoader } from "../shared/GradingLoader";
import { ScoreBanner } from "../shared/ScoreBanner";
import { chip, label, primaryBtn, secondaryBtn, surface } from "../shared/ui";
import { KeyPointsChecklist, ReadingCard, RecallHeading } from "./ReadingPieces";
import { READING_PASS_SCORE, type ReadingProgressState } from "@/lib/drills/readingProgress";
import type { KeyPoint, ReadingPassage } from "./mock";
import { readingPassage } from "./mock";

// One passage the drill can run. Mirrors ReadingContent on a DrillQuestion: the
// page maps a DB question -> this shape ({ id, body, readSeconds, keyPoints }).
export type ReadingItem = {
  id: string;
  body: string[];
  readSeconds: number;
  keyPoints: string[];
};

type Phase = "read" | "recall" | "grading" | "feedback" | "error";

// The grade endpoint's success shape for grade-summary drills.
type GradeResponse = {
  score: number;
  verdict: string;
  captured: { text: string; captured: boolean }[];
  xpAwarded?: number;
  readingProgress?: ReadingProgressState;
};

type GradeError = {
  code?: string;
};

// Fallback when the page passes no DB passages: reuse the single mock passage.
// `id` is empty so a misconfigured run can't masquerade as a real question.
const MOCK_ITEM: ReadingItem = {
  id: "",
  body: readingPassage.body,
  readSeconds: readingPassage.readSeconds,
  keyPoints: [],
};

export function ReadingDrill({
  passages,
  initialProgress,
  returnHref = "/drills",
}: {
  passages?: ReadingItem[];
  initialProgress: ReadingProgressState;
  returnHref?: string;
}) {
  const items = passages && passages.length > 0 ? passages : [MOCK_ITEM];

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("read");
  const item = items[index % items.length];

  const [secondsLeft, setSecondsLeft] = useState(item.readSeconds);
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState<GradeResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [quotaReached, setQuotaReached] = useState(false);
  const [progress, setProgress] = useState(initialProgress);

  const lowTime = secondsLeft <= 20;

  // Countdown only runs during the timed read. Hitting zero advances to recall,
  // the same as pressing "Done Reading".
  useEffect(() => {
    if (phase !== "read") return;
    const id = window.setInterval(() => {
      if (secondsLeft <= 1) setPhase("recall");
      else setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, secondsLeft]);

  async function gradeSummary(text: string) {
    setSummary(text);
    if (!item.id) {
      // Demo/fallback passage with no DB id — grading can't run against it.
      setErrorMsg("This is a demo passage. Publish a reading question in the admin to enable grading.");
      setPhase("error");
      return;
    }
    setPhase("grading");
    setErrorMsg("");
    setQuotaReached(false);
    try {
      const res = await fetch("/api/drills/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drillSlug: "reading", questionId: item.id, studentText: text }),
      });
      if (!res.ok) {
        const failure = (await res.json().catch(() => ({}))) as GradeError;
        if (failure.code === "monthly_ai_limit") {
          setErrorMsg(
            "You've reached your 500 AI submissions for this month. Your limit resets on the first of next month.",
          );
          setQuotaReached(true);
          setPhase("error");
          return;
        }
        throw new Error(`Grading failed (${res.status})`);
      }
      const data = (await res.json()) as GradeResponse;
      setResult(data);
      if (data.readingProgress) setProgress(data.readingProgress);
      setPhase("feedback");
    } catch {
      setPhase("error");
      setErrorMsg("We couldn't grade your summary. Check your connection and try again.");
    }
  }

  // Re-run grading with the summary the student already wrote.
  function retry() {
    if (summary.trim()) gradeSummary(summary);
    else setPhase("recall");
  }

  function nextPassage() {
    setIndex((i) => (i + 1) % items.length);
    setSummary("");
    setResult(null);
    setErrorMsg("");
    setQuotaReached(false);
    setSecondsLeft(items[(index + 1) % items.length].readSeconds);
    setPhase("read");
  }

  const passageForCard: ReadingPassage = {
    level: progress.level,
    readSeconds: item.readSeconds,
    body: item.body,
  };

  const keyPoints: KeyPoint[] = result
    ? result.captured.map((c) => ({ text: c.text, captured: c.captured }))
    : [];

  // Timer lives in the header center slot during the read; nowhere else.
  const center =
    phase === "read" ? <DigitalTimer seconds={secondsLeft} warning={lowTime} /> : null;

  const right = (
    <span className="hidden items-center gap-2.5 text-sm text-navy/55 sm:inline-flex">
      Streak
      <StreakDots streak={progress.streak} target={progress.streakTarget} />
      <span className="tabular-nums text-navy/40">
        {progress.streak}/{progress.streakTarget}
      </span>
    </span>
  );

  return (
    <DrillShell
      title="Reading Comprehension Drill"
      eyebrow="Reading & Writing"
      exitHref={returnHref}
      exitLabel="Exit Drill"
      center={center}
      right={right}
    >
      {/* Progression rule bar — Level pill + streak target, shown while practicing. */}
      {phase === "read" || phase === "recall" ? (
        <div className={`mx-auto mb-5 max-w-3xl ${surface} flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5`}>
          <span className={`${chip} bg-brand/10 text-brand`}>Level {progress.level}</span>
          <span className="h-4 w-px bg-navy/12" />
          <span className="text-sm text-navy/65">
            Your current streak is {progress.streak}. Get {progress.streakTarget} in a row to
            advance to level {progress.level + 1}.
          </span>
        </div>
      ) : null}

      {phase === "read" ? (
        <>
          <PhaseNote
            kicker="Phase 1: Timed Reading"
            text="Read closely. The passage disappears when the timer ends or you finish."
          />
          <ReadingCard passage={passageForCard} onDone={() => setPhase("recall")} />
        </>
      ) : null}

      {phase === "recall" ? (
        <div className="mx-auto max-w-3xl space-y-4">
          <PhaseNote
            kicker="Phase 2: Recall"
            text="From memory only. Capture the main idea and every supporting detail you can."
          />
          <RecallHeading />
          <ExplainInput
            label="Your Summary"
            placeholder="Write everything you remember about the passage. Capture all the key points, findings, and arguments..."
            submitLabel="Submit"
            onSubmit={gradeSummary}
          />
        </div>
      ) : null}

      {phase === "grading" ? (
        <GradingLoader
          title="Grading your recall..."
          subtitle="Comparing your summary against the passage's key points."
        />
      ) : null}

      {phase === "error" ? (
        <div className="mx-auto max-w-3xl">
          <div className={`${surface} border-danger/30 bg-danger-bg/40 px-5 py-5 text-center`}>
            <p className="font-display text-base font-bold text-danger-600">Grading failed</p>
            <p className="mt-1 text-sm text-navy/60">{errorMsg}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {!quotaReached ? (
                <button type="button" onClick={retry} className={primaryBtn}>
                  Try again
                </button>
              ) : null}
              <Link href={returnHref} className={secondaryBtn}>
                Back to drills
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {phase === "feedback" && result ? (
        <div className="mx-auto max-w-3xl space-y-4">
          <ScoreBanner
            score={result.score}
            verdict={result.verdict}
            successThreshold={READING_PASS_SCORE}
          />
          {result.xpAwarded ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0b2a5b,#1b46a8)] px-4 py-3 text-center font-display text-lg font-extrabold text-gold">
              +{result.xpAwarded} XP earned
            </div>
          ) : null}
          {keyPoints.length > 0 ? <KeyPointsChecklist points={keyPoints} /> : null}
          <SummaryRecap summary={summary} />
          <div className="flex flex-wrap gap-3 pt-1">
            <button type="button" onClick={nextPassage} className={primaryBtn}>
              Next passage
            </button>
            <Link href={returnHref} className={secondaryBtn}>
              Back to drills
            </Link>
          </div>
        </div>
      ) : null}
    </DrillShell>
  );
}

// Small uppercase phase marker above each phase's content.
function PhaseNote({ kicker, text }: { kicker: string; text: string }) {
  return (
    <div className="mx-auto mb-4 max-w-3xl">
      <div className={`${label} text-navy/45`}>{kicker}</div>
      <p className="mt-1 text-sm text-navy/60">{text}</p>
    </div>
  );
}

// Read-back of what the student submitted, shown under the graded result.
function SummaryRecap({ summary }: { summary: string }) {
  return (
    <div className={surface}>
      <div className="border-b border-navy/10 px-4 py-2.5">
        <h3 className={`${label} text-navy/50`}>Your summary</h3>
      </div>
      {summary.trim() ? (
        <p className="whitespace-pre-wrap px-4 py-3.5 font-serif text-[15px] leading-relaxed text-exam-ink">
          {summary}
        </p>
      ) : (
        <p className="px-4 py-3.5 text-sm text-navy/40">No summary submitted.</p>
      )}
    </div>
  );
}
