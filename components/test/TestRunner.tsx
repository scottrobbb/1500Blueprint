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
import { createAsyncQueue } from "@/lib/sat/asyncQueue";
import {
  completionFailureReference,
  parseCompletionFailureDiagnostic,
  type CompletionFailureDiagnostic,
} from "@/lib/sat/completionDiagnostics";
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
import {
  addHighlight as addHighlightTo,
  removeHighlight as removeHighlightFrom,
  setHighlightNote as setNoteOn,
} from "@/lib/sat/highlights";

type SessionSaveReason = "autosave" | "interval" | "exit" | "visibility";
type SessionSaveOptions = {
  state?: TestState;
  highlights?: Record<string, Highlight[]>;
  reason?: SessionSaveReason;
  keepalive?: boolean;
  immediate?: boolean;
};
type SessionSaveResult = { ok: boolean; requestId: string; code?: string };

const PENDING_COMPLETION_DIAGNOSTIC = "practice-test:pending-completion-diagnostic";

function rememberCompletionDiagnostic(diagnostic: CompletionFailureDiagnostic): void {
  try {
    window.localStorage.setItem(PENDING_COMPLETION_DIAGNOSTIC, JSON.stringify(diagnostic));
  } catch {
    // The reference remains visible even when browser storage is unavailable.
  }
}

function readCompletionDiagnostic(): CompletionFailureDiagnostic | null {
  try {
    const raw = window.localStorage.getItem(PENDING_COMPLETION_DIAGNOSTIC);
    return raw ? parseCompletionFailureDiagnostic(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function clearCompletionDiagnostic(requestId: string): void {
  try {
    const pending = readCompletionDiagnostic();
    if (pending?.requestId === requestId) {
      window.localStorage.removeItem(PENDING_COMPLETION_DIAGNOSTIC);
    }
  } catch {
    // A failed cleanup can only cause one duplicate diagnostic on the next load.
  }
}

async function deliverCompletionDiagnostic(diagnostic: CompletionFailureDiagnostic): Promise<void> {
  rememberCompletionDiagnostic(diagnostic);
  try {
    const response = await fetch("/api/telemetry/test-completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(diagnostic),
    });
    if (response.ok) clearCompletionDiagnostic(diagnostic.requestId);
  } catch {
    // Keep the diagnostic locally and retry the next time the runner mounts.
  }
}

function safeResponseCode(value: unknown, status: number): string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)
    ? value
    : `http_${status}`;
}

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
  studentName,
  devMode = false,
  resumeState = null,
  returnToUltimate = false,
}: {
  test: PracticeTest;
  slug: string;
  studentName: string;
  devMode?: boolean;
  resumeState?: SavedSession | null;
  returnToUltimate?: boolean;
}) {
  const router = useRouter();
  const testsHref = returnToUltimate ? "/ultimate/tests" : "/practice-test";
  const completedHref = returnToUltimate ? "/ultimate/tests/completed" : "/practice-test/completed";
  const workspaceQuery = returnToUltimate ? "?workspace=ultimate" : "";
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
  const [showPlannerScorePrompt, setShowPlannerScorePrompt] = useState(false);
  const [attemptSaveStatus, setAttemptSaveStatus] = useState<AttemptSaveStatus>("idle");
  const [attemptSaveFailure, setAttemptSaveFailure] = useState<CompletionFailureDiagnostic | null>(null);
  const [extendedTime, setExtendedTime] = useState<TimeMultiplier>(1);
  const [exitStatus, setExitStatus] = useState<"idle" | "exiting" | "error">("idle");
  const [exitFailure, setExitFailure] = useState<SessionSaveResult | null>(null);
  const [saveQueue] = useState(createAsyncQueue);

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
  // flight racing the completion clear. Ordinary saves are serialized; only the
  // visibility/unload path opts into keepalive.
  // Returns whether the save actually succeeded, so an explicit "Save and
  // Exit" click can tell the difference and warn the student instead of
  // navigating away on a session/access/rate-limit/server error that a plain
  // fetch().catch() can't see (fetch only rejects on a network-level failure,
  // not on a non-2xx response). The background autosave callers below don't
  // need this and just fire-and-forget as before.
  const persist = useCallback((options: SessionSaveOptions = {}): Promise<SessionSaveResult> => {
    const s = options.state ?? stateRef.current;
    const highlightSnapshot = options.highlights ?? highlightsRef.current;
    const reason = options.reason ?? "autosave";
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
      return Promise.resolve({ ok: true, requestId: "save-skipped" });
    }

    const requestId = crypto.randomUUID();
    const save = async (): Promise<SessionSaveResult> => {
      try {
        const response = await fetch("/api/tests/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-client-request-id": requestId,
            "x-test-save-reason": reason,
          },
          body: JSON.stringify({ testSlug: slug, state: s, highlights: highlightSnapshot }),
          keepalive: options.keepalive ?? false,
        });
        if (response.ok) return { ok: true, requestId };
        const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
        const code = safeResponseCode(body?.code, response.status);
        console.error(JSON.stringify({
          event: "practice_test.session_client.failed",
          requestId,
          testSlug: slug,
          reason,
          code,
          status: response.status,
        }));
        return { ok: false, requestId, code };
      } catch (error) {
        const code = error instanceof Error ? error.name : "UnknownError";
        console.error(JSON.stringify({
          event: "practice_test.session_client.failed",
          requestId,
          testSlug: slug,
          reason,
          code,
        }));
        return { ok: false, requestId, code };
      }
    };

    return options.immediate ? save() : saveQueue.run(save);
  }, [saveQueue, slug, test]);

  async function handleSaveAndExit() {
    if (exitStatus === "exiting") return;
    setExitStatus("exiting");
    setExitFailure(null);
    const saved = await persist({
      state,
      highlights,
      reason: "exit",
    });
    if (!saved.ok) {
      setExitFailure(saved);
      setExitStatus("error");
      return;
    }
    setArmed(slug, false);
    router.push(testsHref);
  }

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
    const id = setTimeout(() => {
      void persist({ reason: "autosave" });
    }, 1200);
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
    const id = setInterval(() => {
      void persist({ reason: "interval" });
    }, 15000);
    return () => clearInterval(id);
  }, [persist, state.phase]);

  // Save on tab hide / unload (covers refresh and closing the tab).
  useEffect(() => {
    const saveOnHide = () => {
      void persist({ reason: "visibility", keepalive: true, immediate: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveOnHide();
    };
    window.addEventListener("pagehide", saveOnHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", saveOnHide);
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
  // a retried POST idempotent server-side.
  const completedRef = useRef(false);
  const completionTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const pending = readCompletionDiagnostic();
    if (pending) void deliverCompletionDiagnostic(pending);
  }, []);

  const saveCompletedAttempt = useCallback(async () => {
    const s = stateRef.current;
    const clientToken = completionTokenRef.current ?? crypto.randomUUID();
    const requestId = crypto.randomUUID();
    completionTokenRef.current = clientToken;
    setAttemptSaveStatus("saving");
    setAttemptSaveFailure(null);

    try {
      const response = await fetch("/api/tests/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-request-id": requestId,
        },
        body: JSON.stringify({
          testSlug: slug,
          answers: s.answers,
          routed: s.routed,
          perQuestionTime: s.perQuestionTime,
          clientToken,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        attemptId?: unknown;
        hasStudyPlanner?: unknown;
        code?: unknown;
      } | null;
      if (!response.ok) {
        const diagnostic: CompletionFailureDiagnostic = {
          requestId,
          testSlug: slug,
          kind: "http",
          code: safeResponseCode(data?.code, response.status),
          errorName: "CompletionResponseError",
          status: response.status,
        };
        console.error(JSON.stringify({ event: "practice_test.completion_client.failed", ...diagnostic }));
        setAttemptSaveFailure(diagnostic);
        setAttemptSaveStatus("error");
        void deliverCompletionDiagnostic(diagnostic);
        return;
      }

      if (typeof data?.attemptId !== "string") {
        const diagnostic: CompletionFailureDiagnostic = {
          requestId,
          testSlug: slug,
          kind: "invalid_response",
          code: "attempt_id_missing",
          errorName: "CompletionResponseError",
        };
        console.error(JSON.stringify({ event: "practice_test.completion_client.failed", ...diagnostic }));
        setAttemptSaveFailure(diagnostic);
        setAttemptSaveStatus("error");
        void deliverCompletionDiagnostic(diagnostic);
        return;
      }
      setSavedAttemptId(data.attemptId);
      setShowPlannerScorePrompt(Boolean(data.hasStudyPlanner));
      setAttemptSaveFailure(null);
      setAttemptSaveStatus("saved");
    } catch (error) {
      const diagnostic: CompletionFailureDiagnostic = {
        requestId,
        testSlug: slug,
        kind: "network",
        code: "fetch_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      };
      console.error(JSON.stringify({ event: "practice_test.completion_client.failed", ...diagnostic }));
      setAttemptSaveFailure(diagnostic);
      setAttemptSaveStatus("error");
      void deliverCompletionDiagnostic(diagnostic);
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

  function addHighlight(questionId: string, highlight: Highlight) {
    setHighlights((prev) => addHighlightTo(prev, questionId, highlight));
  }
  function removeHighlight(questionId: string, start: number, end: number) {
    setHighlights((prev) => removeHighlightFrom(prev, questionId, start, end));
  }
  function setHighlightNote(questionId: string, id: string, note: string) {
    setHighlights((prev) => setNoteOn(prev, questionId, id, note));
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
        studentName={studentName}
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
            setShowPlannerScorePrompt(false);
            setAttemptSaveStatus("idle");
            setAttemptSaveFailure(null);
            completionTokenRef.current = null;
            dispatch({ type: "RESTART" });
          }}
          saveStatus={state.completedViaFlow ? attemptSaveStatus : undefined}
          saveErrorReference={attemptSaveFailure ? completionFailureReference(attemptSaveFailure) : undefined}
          onRetrySave={saveCompletedAttempt}
          savedHref={savedAttemptId ? `/practice-test/${slug}/results/${savedAttemptId}${workspaceQuery}` : undefined}
          attemptsHref={`/practice-test/${slug}/attempts${workspaceQuery}`}
          completedHref={completedHref}
          testsHref={testsHref}
          scorePromptAttemptId={savedAttemptId ?? undefined}
          shouldPromptForScore={showPlannerScorePrompt}
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
      onExit={() => void handleSaveAndExit()}
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
      {exitStatus === "error" && (
        <SaveExitErrorDialog
          reference={exitFailure?.requestId.slice(0, 8)}
          onRetry={() => void handleSaveAndExit()}
          onDismiss={() => {
            setExitFailure(null);
            setExitStatus("idle");
          }}
        />
      )}
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
          studentName={studentName}
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
        studentName={studentName}
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

function SaveExitErrorDialog({
  reference,
  onRetry,
  onDismiss,
}: {
  reference?: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-exam-sans">
      <button
        type="button"
        aria-label="Close"
        onClick={onDismiss}
        className="absolute inset-0 cursor-default bg-black/30"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="save-exit-error-title"
        className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
      >
        <h2 id="save-exit-error-title" className="text-[17px] font-semibold text-exam-ink">
          Your progress was not saved
        </h2>
        <p className="mt-2 text-[14px] leading-6 text-exam-ink/70">
          Something went wrong saving your test. Stay on this page and try again before leaving --
          your answers are still here.{reference ? ` Reference: ${reference}.` : ""}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 cursor-pointer rounded-lg px-4 text-sm font-semibold text-exam-ink hover:bg-exam-tint"
          >
            Keep testing
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 cursor-pointer rounded-lg bg-exam-blue px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            Retry save
          </button>
        </div>
      </div>
    </div>
  );
}
