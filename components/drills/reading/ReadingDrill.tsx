"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DrillShell } from "../shared/DrillShell";
import { DigitalTimer, StreakDots } from "../shared/Hud";
import { ExplainInput } from "../shared/ExplainInput";
import { GradingLoader } from "../shared/GradingLoader";
import { ScoreBanner } from "../shared/ScoreBanner";
import { chip, label, primaryBtn, secondaryBtn, surface } from "../shared/ui";
import { MissedPoints, ReadingCard, RecallHeading } from "./ReadingPieces";
import { READING_DIFFICULTY_LABEL } from "@/lib/drills/readingLevels";
import type { ReadingProgressState } from "@/lib/drills/readingProgress";
import type { GradedReadingPoint } from "@/lib/drills/readingGrading";

// generating -> read -> recall -> grading -> feedback, with one error screen
// that knows whether it interrupted the generate or the grade.
type Phase = "generating" | "read" | "recall" | "grading" | "feedback" | "error";

type PassageResponse = {
  passageId: string;
  body: string[];
  readSeconds: number;
  progress?: ReadingProgressState;
};

type GradeResponse = {
  score: number;
  verdict: string;
  passScore: number;
  passed: boolean;
  core: GradedReadingPoint[];
  depth: GradedReadingPoint[];
  fabrications: string[];
  progress?: ReadingProgressState;
  xpAwarded?: number;
};

type ApiError = {
  error?: string;
  code?: string;
};

export function ReadingDrill({
  initialProgress,
  returnHref = "/drills",
}: {
  initialProgress: ReadingProgressState;
  returnHref?: string;
}) {
  const [phase, setPhase] = useState<Phase>("generating");
  const [progress, setProgress] = useState(initialProgress);
  const [passage, setPassage] = useState<PassageResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(initialProgress.readSeconds);
  // Absolute end of the read, so a backgrounded tab cannot bank extra time.
  const [deadline, setDeadline] = useState(0);
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState<GradeResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [failedStep, setFailedStep] = useState<"generate" | "grade">("generate");
  const [terminal, setTerminal] = useState(false);

  // Bumping this asks for a fresh passage. A generation still in flight when it
  // changes is abandoned, so a double "Next passage" can never drop a stale
  // passage onto the screen.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let abandoned = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/drills/reading/passage", {
          method: "POST",
          signal: controller.signal,
        });
        if (!res.ok) {
          const failure = (await res.json().catch(() => ({}))) as ApiError;
          throw new DrillError(
            failure.error ?? "We couldn't generate a passage. Try again in a moment.",
            failure.code === "plan_limit" || failure.code === "rate_limit",
          );
        }
        const data = (await res.json()) as PassageResponse;
        if (abandoned) return;
        setPassage(data);
        setSecondsLeft(data.readSeconds);
        setDeadline(Date.now() + data.readSeconds * 1000);
        if (data.progress) setProgress(data.progress);
        setPhase("read");
      } catch (error) {
        if (abandoned) return;
        setFailedStep("generate");
        setTerminal(error instanceof DrillError && error.terminal);
        setErrorMsg(
          error instanceof DrillError
            ? error.message
            : "We couldn't generate a passage. Check your connection and try again.",
        );
        setPhase("error");
      }
    })();
    return () => {
      abandoned = true;
      controller.abort();
    };
  }, [generation]);

  // Clears the previous attempt and asks the effect above for a new passage.
  function generate() {
    setPhase("generating");
    setPassage(null);
    setResult(null);
    setSummary("");
    setErrorMsg("");
    setTerminal(false);
    setGeneration((n) => n + 1);
  }

  // The countdown only runs during the timed read. Hitting zero moves to recall,
  // the same as pressing "Done Reading" — the passage is gone either way.
  useEffect(() => {
    if (phase !== "read") return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setPhase("recall");
    };
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [phase, deadline]);

  async function gradeSummary(text: string) {
    if (!passage) return;
    setSummary(text);
    setPhase("grading");
    setErrorMsg("");
    setTerminal(false);
    try {
      const res = await fetch("/api/drills/reading/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passageId: passage.passageId, studentText: text }),
      });
      if (!res.ok) {
        const failure = (await res.json().catch(() => ({}))) as ApiError;
        if (failure.code === "monthly_ai_limit") {
          throw new DrillError(
            "You've reached your 500 AI submissions for this month. Your limit resets on the first of next month.",
            true,
          );
        }
        throw new DrillError(
          failure.error ?? "We couldn't grade your summary. Try again in a moment.",
          failure.code === "plan_limit" || failure.code === "passage_spent",
        );
      }
      const data = (await res.json()) as GradeResponse;
      setResult(data);
      if (data.progress) setProgress(data.progress);
      setPhase("feedback");
    } catch (error) {
      setFailedStep("grade");
      setTerminal(error instanceof DrillError && error.terminal);
      setErrorMsg(
        error instanceof DrillError
          ? error.message
          : "We couldn't grade your summary. Check your connection and try again.",
      );
      setPhase("error");
    }
  }

  // Re-run the failed step with the work the student already did.
  function retry() {
    if (failedStep === "generate") generate();
    else if (summary.trim()) void gradeSummary(summary);
    else setPhase("recall");
  }

  const lowTime = secondsLeft <= 20;
  const difficultyLabel = READING_DIFFICULTY_LABEL[progress.difficulty];

  // The timer lives in the header centre slot during the read; nowhere else.
  const center = phase === "read" ? <DigitalTimer seconds={secondsLeft} warning={lowTime} /> : null;

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
      {/* Level bar — where the student stands and what clears the next rung. */}
      {phase !== "feedback" ? (
        <div className={`mx-auto mb-5 max-w-3xl ${surface} flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5`}>
          <span className={`${chip} bg-brand/10 text-brand`}>Level {progress.level}</span>
          <span className="h-4 w-px bg-navy/12" />
          <span className="text-sm text-navy/65">
            {difficultyLabel} passage, {progress.passScore}+ to pass.{" "}
            {progress.isMaxLevel
              ? `You're at the max level. Get ${progress.streakTarget} in a row to master it.`
              : `Your current streak is ${progress.streak}. Get ${progress.streakTarget} in a row to advance to level ${progress.level + 1}.`}
          </span>
        </div>
      ) : null}

      {phase === "generating" ? (
        <GradingLoader
          title="Generating passage..."
          subtitle="Remember, no backtracking. Lock in."
        />
      ) : null}

      {phase === "read" && passage ? (
        <>
          <PhaseNote
            kicker="Phase 1: Timed Reading"
            text="Read closely. The passage disappears when the timer ends or you finish."
          />
          <ReadingCard body={passage.body} onDone={() => setPhase("recall")} />
        </>
      ) : null}

      {phase === "recall" ? (
        <div className="mx-auto max-w-3xl space-y-4">
          <PhaseNote
            kicker="Phase 2: Recall"
            text="From memory only. Lead with the main idea, the finding, and the timeline."
          />
          <RecallHeading />
          <ExplainInput
            label="Your Summary"
            helper="Start with what the passage was about, what it found, and when. Then add the detail you remember."
            placeholder="Write everything you remember about the passage. Capture all the key points, findings, and arguments..."
            submitLabel="Submit"
            onSubmit={gradeSummary}
          />
        </div>
      ) : null}

      {phase === "grading" ? (
        <GradingLoader
          title="Grading your recall..."
          subtitle="Checking your summary against the passage's core and depth points."
        />
      ) : null}

      {phase === "error" ? (
        <div className="mx-auto max-w-3xl">
          <div className={`${surface} border-danger/30 bg-danger-bg/40 px-5 py-5 text-center`}>
            <p className="font-display text-base font-bold text-danger-600">
              {failedStep === "generate" ? "Passage generation failed" : "Grading failed"}
            </p>
            <p className="mt-1 text-sm text-navy/60">{errorMsg}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {!terminal ? (
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
            successThreshold={result.passScore}
          />
          <StreakOutcome passed={result.passed} passScore={result.passScore} progress={progress} />
          {result.xpAwarded ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0b2a5b,#1b46a8)] px-4 py-3 text-center font-display text-lg font-extrabold text-gold">
              +{result.xpAwarded} XP earned
            </div>
          ) : null}
          <MissedPoints core={result.core} depth={result.depth} />
          {result.fabrications.length > 0 ? (
            <Fabrications claims={result.fabrications} />
          ) : null}
          <SummaryRecap summary={summary} />
          <div className="flex flex-wrap gap-3 pt-1">
            <button type="button" onClick={generate} className={primaryBtn}>
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

// An API failure the student should read as-is. `terminal` marks the ones a
// retry cannot fix (quota spent, plan limit, passage already graded).
class DrillError extends Error {
  terminal: boolean;
  constructor(message: string, terminal = false) {
    super(message);
    this.name = "DrillError";
    this.terminal = terminal;
  }
}

// Where the graded attempt left the ladder: the streak that survived it and
// what is still needed to move up.
function StreakOutcome({
  passed,
  passScore,
  progress,
}: {
  passed: boolean;
  passScore: number;
  progress: ReadingProgressState;
}) {
  const remaining = Math.max(0, progress.streakTarget - progress.streak);
  const message = !passed
    ? `Below ${passScore}, so the streak resets. Get ${progress.streakTarget} in a row to move up.`
    : progress.isMaxLevel && remaining === 0
      ? "Level 8 mastered. This is the top of the ladder."
      : remaining === 0
        ? `Level cleared. You're now on level ${progress.level}.`
        : `${remaining} more in a row to reach level ${Math.min(progress.level + 1, 8)}.`;

  return (
    <div className={`${surface} flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3`}>
      <span
        className={`inline-flex items-center rounded-chip px-2.5 py-0.5 text-[13px] font-bold ${
          passed ? "bg-success-bg text-success-600" : "bg-danger-bg text-danger-600"
        }`}
      >
        {passed ? "Passed" : "Missed"}
      </span>
      <StreakDots streak={progress.streak} target={progress.streakTarget} />
      <span className="text-sm text-navy/65">{message}</span>
    </div>
  );
}

// Claims the grader found in the summary that the passage does not support.
function Fabrications({ claims }: { claims: string[] }) {
  return (
    <div className={surface}>
      <div className="border-b border-navy/10 px-4 py-2.5">
        <h3 className="text-[13px] font-bold text-navy">Not in the passage</h3>
      </div>
      <ul className="space-y-1.5 px-4 py-3">
        {claims.map((claim, i) => (
          <li key={i} className="font-serif text-[15px] leading-snug text-navy/70">
            {claim}
          </li>
        ))}
      </ul>
    </div>
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
        <h3 className="text-[13px] font-bold text-navy">Your summary</h3>
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
