"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PracticeTest } from "@/lib/sat/types";
import {
  activeModule,
  activeSection,
  coerceTimeMultiplier,
  formatTime,
  initialState,
  makeReducer,
  type TestState,
  type TimeMultiplier,
} from "@/lib/sat/testState";
import { scoreTest } from "@/lib/sat/scoring";
import type { SavedSession } from "@/lib/sat/testSession";
import type { Highlight } from "./HighlightablePassage";
import { IntroScreen, type ResumeInfo } from "./IntroScreen";
import { TestHeader } from "./TestHeader";
import { PracticeBanner } from "./PracticeBanner";
import { QuestionScreen } from "./QuestionScreen";
import { FooterNav } from "./FooterNav";
import { QuestionNavigator } from "./QuestionNavigator";
import { ReviewPage } from "./ReviewPage";
import { ModuleOverScreen } from "./ModuleOverScreen";
import { DirectionsModal } from "./DirectionsModal";
import { ReferenceModal } from "./ReferenceModal";
import { CalculatorPanel } from "./CalculatorPanel";
import { LineReader } from "./LineReader";
import { BreakScreen } from "./BreakScreen";
import { ResultsScreen, type AttemptSaveStatus } from "./ResultsScreen";
import { DevJumpMenu } from "./DevJumpMenu";

const STUDENT_NAME = "Shouqi Han";

// sessionStorage key marking "this tab was actively mid-module/review/break on
// this test slug, and hasn't explicitly exited since." Deliberately NOT based
// on the Performance Navigation Timing API (`performance.getEntriesByType
// ("navigation")`) — that reflects the tab's ORIGINAL document load for its
// entire lifetime and never resets on a Next.js client-side route change, so
// it can't distinguish "refreshed this test page" from "clicked a link back
// into a test after the tab was reloaded at some earlier, unrelated point" —
// which incorrectly auto-resumed on an ordinary click once the tab had ever
// been reloaded. sessionStorage set/cleared explicitly below has no such gap.
function armedKey(slug: string): string {
  return `test-active:${slug}`;
}
function isArmed(slug: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(armedKey(slug)) === "1";
  } catch {
    return false;
  }
}
function setArmed(slug: string, armed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (armed) window.sessionStorage.setItem(armedKey(slug), "1");
    else window.sessionStorage.removeItem(armedKey(slug));
  } catch {
    // Private-browsing/storage-disabled: fall back to always showing the
    // manual "Resume where you left off?" prompt instead of auto-resuming.
  }
}

// Clamp a saved (possibly stale) state against the live test so a shrunk or
// re-imported form can never strand the runner on an out-of-bounds question.
// Returns null when the saved section/module no longer exists at all.
// Save-and-exit is a true pause: timeLeft is restored exactly as saved,
// regardless of how long the student was away.
function sanitizeResumeState(s: TestState, test: PracticeTest): TestState | null {
  if (s.sectionIndex < 0 || s.sectionIndex >= test.sections.length) return null;
  const section = test.sections[s.sectionIndex];
  const variant = s.routed[section.id] ?? "easy";
  const mod = s.moduleOrder === 1 ? section.module1 : section.module2[variant];
  if (!mod || mod.questions.length === 0) return null;
  const qIndex = Math.min(Math.max(0, s.qIndex), mod.questions.length - 1);
  return {
    ...s,
    qIndex,
    extendedTime: coerceTimeMultiplier(s.extendedTime),
    breakTarget: s.breakTarget === "module2" ? "module2" : s.phase === "break" ? "nextSection" : undefined,
  } satisfies TestState;
}

export function TestRunner({
  test,
  slug,
  devMode = false,
  resumeState = null,
}: {
  test: PracticeTest;
  slug: string;
  devMode?: boolean;
  resumeState?: SavedSession | null;
}) {
  const router = useRouter();
  const reducer = useMemo(() => makeReducer(test), [test]);
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const [overlay, setOverlay] = useState<null | "directions" | "reference">(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [lineReaderOn, setLineReaderOn] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [highlightOn, setHighlightOn] = useState(true);
  const [highlights, setHighlights] = useState<Record<string, Highlight[]>>({});
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const [attemptSaveStatus, setAttemptSaveStatus] = useState<AttemptSaveStatus>("idle");
  const [extendedTime, setExtendedTime] = useState<TimeMultiplier>(1);

  // Latest values for the unload/interval savers, which must not re-bind per change.
  const stateRef = useRef(state);
  const highlightsRef = useRef(highlights);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);

  // The saved state, clamped to the live test once. Drives both the resume offer
  // and the actual RESUME dispatch so neither can use an out-of-range index.
  const safeResume = useMemo(
    () => (resumeState ? sanitizeResumeState(resumeState.state, test) : null),
    [resumeState, test],
  );

  // Persist the in-progress session. Skipped at intro, the transient module-over
  // screen, results (a finished test clears its session server-side instead), and
  // the final-module review (the screen right before results) so no save can be in
  // flight racing the completion clear. keepalive lets a save survive a navigation.
  const persist = useCallback(() => {
    const s = stateRef.current;
    const isFinalReview =
      s.phase === "review" &&
      s.sectionIndex === test.sections.length - 1 &&
      s.moduleOrder === 2;
    if (
      s.phase === "intro" ||
      s.phase === "moduleOver" ||
      s.phase === "results" ||
      isFinalReview
    ) {
      return;
    }
    void fetch("/api/tests/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testSlug: slug, state: s, highlights: highlightsRef.current }),
      keepalive: true,
    }).catch(() => {});
  }, [slug, test]);

  useEffect(() => {
    if (state.phase !== "module" && state.phase !== "review" && state.phase !== "break") return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "moduleOver") return;
    const id = setTimeout(() => dispatch({ type: "ADVANCE" }), 2200);
    return () => clearTimeout(id);
  }, [state.phase]);

  // Debounced save on meaningful changes. timeLeft is intentionally excluded so a
  // tick never saves; highlights and the restored toggles are included so they too
  // survive a resume.
  useEffect(() => {
    if (state.phase === "intro" || state.phase === "moduleOver" || state.phase === "results") return;
    const id = setTimeout(persist, 1200);
    return () => clearTimeout(id);
  }, [
    persist,
    state.phase,
    state.sectionIndex,
    state.moduleOrder,
    state.qIndex,
    state.answers,
    state.marked,
    state.eliminated,
    state.routed,
    state.eliminatorOn,
    state.timerHidden,
    highlights,
  ]);

  // Periodic save while a module/review/break timer runs, so the remaining time is
  // captured even if the student leaves without interacting.
  useEffect(() => {
    if (state.phase !== "module" && state.phase !== "review" && state.phase !== "break") return;
    const id = setInterval(persist, 15000);
    return () => clearInterval(id);
  }, [persist, state.phase]);

  // Save on tab hide / unload (covers refresh and closing the tab).
  useEffect(() => {
    const onHide = () => persist();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persist]);

  // A stale session that no longer maps onto the live test is cleared so it stops
  // being offered (and stops loading on the server).
  useEffect(() => {
    if (resumeState && !safeResume) {
      void fetch(`/api/tests/session?testSlug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
    }
  }, [resumeState, safeResume, slug]);

  // On a genuine finish (not the dev jump), save the completed attempt and award
  // XP exactly once, then surface a link to its permanent report. The token makes
  // a retried keepalive POST idempotent server-side.
  const completedRef = useRef(false);
  const completionTokenRef = useRef<string | null>(null);

  const saveCompletedAttempt = useCallback(async () => {
    const s = stateRef.current;
    const clientToken = completionTokenRef.current ?? crypto.randomUUID();
    completionTokenRef.current = clientToken;
    setAttemptSaveStatus("saving");

    try {
      const response = await fetch("/api/tests/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testSlug: slug,
          answers: s.answers,
          routed: s.routed,
          perQuestionTime: s.perQuestionTime,
          clientToken,
        }),
        keepalive: true,
      });
      if (!response.ok) throw new Error("Attempt save failed");

      const data = (await response.json()) as { attemptId?: string };
      if (!data.attemptId) throw new Error("Attempt id missing");
      setSavedAttemptId(data.attemptId);
      setAttemptSaveStatus("saved");
    } catch {
      setAttemptSaveStatus("error");
    }
  }, [slug]);

  useEffect(() => {
    if (state.phase !== "results" || !state.completedViaFlow) {
      completedRef.current = false;
      return;
    }
    if (completedRef.current) return;
    completedRef.current = true;
    void saveCompletedAttempt();
  }, [saveCompletedAttempt, state.phase, state.completedViaFlow]);

  // Describe a resumable saved session for the intro's "Resume" card.
  const resumeInfo = useMemo<ResumeInfo | null>(() => {
    if (!safeResume) return null;
    const ph = safeResume.phase;
    if (ph !== "module" && ph !== "review" && ph !== "break" && ph !== "moduleOver") return null;
    const sec = test.sections[safeResume.sectionIndex];
    const sectionLabel =
      ph === "break"
        ? "your break before the next section"
        : `Section ${safeResume.sectionIndex + 1}, Module ${safeResume.moduleOrder} (${sec?.name ?? ""})`;
    const timeLabel = formatTime(safeResume.timeLeft);
    return { sectionLabel, timeLabel };
  }, [safeResume, test]);

  function handleResume() {
    if (!resumeState) return;
    const currentResume = sanitizeResumeState(resumeState.state, test);
    if (!currentResume) return;
    setExtendedTime(currentResume.extendedTime);
    setHighlights(resumeState?.highlights ?? {});
    dispatch({ type: "RESUME", state: currentResume });
  }

  // Keep the "armed" flag in sync with whether this tab is actively mid-test,
  // so a later mount (e.g. after a refresh) can tell that apart from a
  // deliberate return. Only module/review/break count as "active" — arming
  // during "moduleOver" would incorrectly survive a Save and Exit that
  // happens to land in that instant, and results/intro never need it.
  useEffect(() => {
    if (state.phase === "module" || state.phase === "review" || state.phase === "break") {
      setArmed(slug, true);
    }
  }, [state.phase, slug]);

  // A refresh (or back/forward) mid-module must be invisible: silently resume
  // into the exact question/review/break, timer included, instead of showing
  // the "Resume where you left off?" prompt a deliberate return (e.g. from the
  // tests list after Save and Exit) still shows. This has to live in an effect
  // — sessionStorage is only knowable client-side post-mount, so deciding it
  // during render would make the server and client's first render diverge (a
  // hydration mismatch). Runs once; the ref guards against Strict Mode's dev
  // double-invoke re-dispatching.
  const autoResumedRef = useRef(false);
  useEffect(() => {
    if (autoResumedRef.current) return;
    if (state.phase !== "intro") return;
    if (!resumeState || !safeResume) return;
    if (safeResume.phase !== "module" && safeResume.phase !== "review" && safeResume.phase !== "break") return;
    if (!isArmed(slug)) return;
    autoResumedRef.current = true;
    const currentResume = sanitizeResumeState(resumeState.state, test);
    if (!currentResume) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setExtendedTime(currentResume.extendedTime);
    setHighlights(resumeState.highlights ?? {});
    dispatch({ type: "RESUME", state: currentResume });
  }, [resumeState, safeResume, state.phase, test, slug]);

  function handleStartOver() {
    setResumeDismissed(true);
    setArmed(slug, false);
    void fetch(`/api/tests/session?testSlug=${encodeURIComponent(slug)}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  }

  function addHighlight(qid: string, h: Highlight) {
    setHighlights((prev) => ({ ...prev, [qid]: [...(prev[qid] ?? []), h] }));
  }
  function removeHighlight(qid: string, start: number, end: number) {
    setHighlights((prev) => ({
      ...prev,
      [qid]: (prev[qid] ?? []).filter((h) => !(h.start < end && h.end > start)),
    }));
  }
  function setHighlightNote(qid: string, id: string, note: string) {
    setHighlights((prev) => ({
      ...prev,
      [qid]: (prev[qid] ?? []).map((h) => (h.id === id ? { ...h, note } : h)),
    }));
  }

  const devMenu = devMode ? (
    <DevJumpMenu
      test={test}
      onJumpModule={(sectionIndex, moduleOrder, variant) =>
        dispatch({ type: "DEV_JUMP", sectionIndex, moduleOrder, variant })
      }
      onJumpResults={() => dispatch({ type: "DEV_RESULTS" })}
    />
  ) : null;

  if (state.phase === "intro") {
    const showResume = resumeInfo && !resumeDismissed ? resumeInfo : null;
    return (
      <>
        {devMenu}
        <IntroScreen
          test={test}
          onStart={() => dispatch({ type: "START", extendedTime })}
          resume={showResume}
          onResume={handleResume}
          onStartOver={handleStartOver}
          extendedTime={extendedTime}
          onExtendedTimeChange={setExtendedTime}
        />
      </>
    );
  }
  if (state.phase === "moduleOver") {
    return <ModuleOverScreen />;
  }
  if (state.phase === "break") {
    return (
      <BreakScreen
        timeLeft={state.timeLeft}
        studentName={STUDENT_NAME}
        betweenModules={state.breakTarget === "module2"}
        onResume={() => dispatch({ type: "END_BREAK" })}
      />
    );
  }
  if (state.phase === "results") {
    const result = scoreTest(test, state.routed, state.answers);
    return (
      <>
        {devMenu}
        <ResultsScreen
          test={test}
          result={result}
          routed={state.routed}
          answers={state.answers}
          perQuestionTime={state.perQuestionTime}
          onRestart={() => {
            setSavedAttemptId(null);
            setAttemptSaveStatus("idle");
            completionTokenRef.current = null;
            dispatch({ type: "RESTART" });
          }}
          saveStatus={state.completedViaFlow ? attemptSaveStatus : undefined}
          onRetrySave={saveCompletedAttempt}
          savedHref={savedAttemptId ? `/practice-test/${slug}/results/${savedAttemptId}` : undefined}
          attemptsHref={`/practice-test/${slug}/attempts`}
        />
      </>
    );
  }

  const section = activeSection(test, state);
  if (!section) return null; // defensive: never reached after sanitizeResumeState
  const mod = activeModule(test, state);
  const question = mod.questions[state.qIndex];
  const moduleLabel = `Section ${state.sectionIndex + 1}, Module ${state.moduleOrder}: ${section.name}`;
  const isMath = section.id === "math";

  const header = (
    <TestHeader
      moduleLabel={moduleLabel}
      isMath={isMath}
      timeLeft={state.timeLeft}
      timerHidden={state.timerHidden}
      warning={state.timeLeft <= 300}
      highlightEnabled={highlightOn}
      onToggleTimer={() => dispatch({ type: "TOGGLE_TIMER" })}
      onToggleHighlights={() => setHighlightOn((o) => !o)}
      onOpenDirections={() => setOverlay("directions")}
      onOpenReference={() => setOverlay("reference")}
      onOpenCalculator={() => setCalcOpen(true)}
      onOpenLineReader={() => setLineReaderOn(true)}
      onExit={() => {
        persist();
        setArmed(slug, false);
        router.push("/practice-test");
      }}
    />
  );

  const overlays = (
    <>
      {overlay === "directions" && (
        <DirectionsModal section={section} onClose={() => setOverlay(null)} />
      )}
      {overlay === "reference" && <ReferenceModal onClose={() => setOverlay(null)} />}
      {calcOpen && <CalculatorPanel onClose={() => setCalcOpen(false)} />}
      {lineReaderOn && <LineReader onClose={() => setLineReaderOn(false)} />}
    </>
  );

  if (state.phase === "review") {
    return (
      <div className="flex h-dvh flex-col bg-exam-bg text-exam-ink">
        {header}
        <PracticeBanner />
        <ReviewPage
          title={`${moduleLabel} Questions`}
          module={mod}
          answers={state.answers}
          marked={state.marked}
          onGoto={(i) => dispatch({ type: "GOTO", index: i })}
        />
        <FooterNav
          studentName={STUDENT_NAME}
          showCenter={false}
          canBack
          onBack={() => dispatch({ type: "GOTO", index: state.qIndex })}
          onNext={() => dispatch({ type: "SUBMIT_MODULE" })}
        />
        {overlays}
        {devMenu}
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="flex h-dvh flex-col bg-exam-bg text-exam-ink">
      {header}
      <PracticeBanner />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <QuestionScreen
          section={section}
          question={question}
          index={state.qIndex}
          answer={state.answers[question.id]}
          marked={Boolean(state.marked[question.id])}
          eliminated={state.eliminated[question.id] ?? []}
          eliminatorOn={state.eliminatorOn}
          highlightEnabled={highlightOn}
          highlights={highlights[question.id] ?? []}
          onSelect={(value) => dispatch({ type: "SELECT", questionId: question.id, value })}
          onToggleMark={() => dispatch({ type: "TOGGLE_MARK", questionId: question.id })}
          onToggleEliminate={(choice) =>
            dispatch({ type: "TOGGLE_ELIMINATE", questionId: question.id, choice })
          }
          onToggleEliminator={() =>
            dispatch({ type: "SET_ELIMINATOR", on: !state.eliminatorOn })
          }
          onAddHighlight={(h) => addHighlight(question.id, h)}
          onRemoveHighlight={(s, e) => removeHighlight(question.id, s, e)}
          onSetNote={(id, note) => setHighlightNote(question.id, id, note)}
          calcOpen={calcOpen}
        />

        {navOpen && (
          <QuestionNavigator
            title={`${moduleLabel} Questions`}
            module={mod}
            currentIndex={state.qIndex}
            answers={state.answers}
            marked={state.marked}
            onGoto={(i) => {
              dispatch({ type: "GOTO", index: i });
              setNavOpen(false);
            }}
            onGotoReview={() => {
              dispatch({ type: "OPEN_REVIEW" });
              setNavOpen(false);
            }}
            onClose={() => setNavOpen(false)}
          />
        )}
      </div>

      <FooterNav
        studentName={STUDENT_NAME}
        questionLabel={`Question ${state.qIndex + 1} of ${mod.questions.length}`}
        canBack={state.qIndex > 0}
        onBack={() => dispatch({ type: "BACK" })}
        onNext={() => dispatch({ type: "NEXT" })}
        onToggleNavigator={() => setNavOpen((o) => !o)}
        navigatorOpen={navOpen}
      />
      {overlays}
      {devMenu}
    </div>
  );
}
