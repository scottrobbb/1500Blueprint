"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnswerMap, AnswerValue, ChoiceId, Section, TestModule } from "@/lib/sat/types";
import type { PracticeModuleMeta } from "@/lib/sat/modules";
import type { Highlight } from "./HighlightablePassage";
import { promptHighlightKey } from "@/lib/sat/highlights";
import { TestHeader } from "./TestHeader";
import { PracticeBanner } from "./PracticeBanner";
import { QuestionScreen } from "./QuestionScreen";
import { FooterNav } from "./FooterNav";
import { QuestionNavigator } from "./QuestionNavigator";
import { ReviewPage } from "./ReviewPage";
import { DirectionsModal } from "./DirectionsModal";
import { ReferenceModal } from "./ReferenceModal";
import { CalculatorPanel } from "./CalculatorPanel";
import { LineReader } from "./LineReader";
import { ModuleResults } from "./ModuleResults";

type Phase = "module" | "review" | "results";

// A focused, single-module practice runner. Reuses the full test's Bluebook UI
// but runs ONE module on a linear path (no adaptive routing, breaks, section 2,
// or scaled scoring) and ends on a raw score report. Independent from
// TestRunner, so the full-test flow is untouched.
export function ModuleRunner({
  slug,
  section,
  module,
  meta,
  studentName,
  returnToUltimate = false,
}: {
  slug: string;
  section: Section;
  module: TestModule;
  meta: PracticeModuleMeta;
  studentName: string;
  returnToUltimate?: boolean;
}) {
  const router = useRouter();
  const totalSeconds = meta.minutes * 60;
  const workspaceQuery = returnToUltimate ? "?workspace=ultimate" : "";
  const modulesHref = `/practice-test/${slug}/modules${workspaceQuery}`;
  const testsHref = returnToUltimate ? "/ultimate/tests" : "/practice-test";

  const [phase, setPhase] = useState<Phase>("module");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [eliminated, setEliminated] = useState<Record<string, ChoiceId[]>>({});
  const [eliminatorOn, setEliminatorOn] = useState(false);
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [timerHidden, setTimerHidden] = useState(false);
  const [perQuestionTime, setPerQuestionTime] = useState<Record<string, number>>({});
  const [highlights, setHighlights] = useState<Record<string, Highlight[]>>({});
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveVersion, setSaveVersion] = useState(0);

  const [overlay, setOverlay] = useState<null | "directions" | "reference">(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [lineReaderOn, setLineReaderOn] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [highlightOn, setHighlightOn] = useState(true);

  const qIndexRef = useRef(qIndex);
  useEffect(() => {
    qIndexRef.current = qIndex;
  }, [qIndex]);
  const saveInFlightRef = useRef(false);
  const attemptTokenRef = useRef(crypto.randomUUID());

  // Review is part of the timed module; reaching zero submits it immediately.
  useEffect(() => {
    if (phase !== "module" && phase !== "review") return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setPhase("results");
          return 0;
        }
        return t - 1;
      });
      if (phase === "module") {
        const q = module.questions[qIndexRef.current];
        if (q) setPerQuestionTime((p) => ({ ...p, [q.id]: (p[q.id] ?? 0) + 1 }));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, module]);

  // Save before offering a persistent report link. The stable token makes a
  // retry after a lost response idempotent.
  useEffect(() => {
    if (phase !== "results" || saveInFlightRef.current || savedAttemptId) return;
    saveInFlightRef.current = true;
    setSaveStatus("saving");
    setSaveError(null);
    void (async () => {
      try {
        const response = await fetch("/api/practice-test/module/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            testSlug: slug,
            moduleKey: meta.key,
            answers,
            perQuestionTime,
            clientToken: attemptTokenRef.current,
          }),
          keepalive: true,
        });
        const body = (await response.json().catch(() => null)) as { attemptId?: string; error?: string } | null;
        if (!response.ok || !body?.attemptId) throw new Error(body?.error ?? "Your module result could not be saved.");
        setSavedAttemptId(body.attemptId);
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : "Your module result could not be saved.");
      } finally {
        saveInFlightRef.current = false;
      }
    })();
  }, [phase, slug, meta.key, answers, perQuestionTime, saveVersion, savedAttemptId]);

  function restart() {
    setPhase("module");
    setQIndex(0);
    setAnswers({});
    setMarked({});
    setEliminated({});
    setEliminatorOn(false);
    setTimeLeft(totalSeconds);
    setPerQuestionTime({});
    setHighlights({});
    setNavOpen(false);
    setSavedAttemptId(null);
    setSaveStatus("idle");
    setSaveError(null);
    setSaveVersion(0);
    saveInFlightRef.current = false;
    attemptTokenRef.current = crypto.randomUUID();
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

  if (module.questions.length === 0) {
    return (
      <div className="grid min-h-dvh place-items-center bg-exam-bg p-6 text-center text-exam-muted">
        This module has no questions yet.
      </div>
    );
  }

  if (phase === "results") {
    return (
      <ModuleResults
        meta={meta}
        module={module}
        answers={answers}
        perQuestionTime={perQuestionTime}
        timeUsedSeconds={totalSeconds - timeLeft}
        slug={slug}
        onRestart={saveStatus === "saving" ? undefined : restart}
        savedHref={
          savedAttemptId
            ? `/practice-test/${slug}/module/${meta.key}/results/${savedAttemptId}${workspaceQuery}`
            : undefined
        }
        saveStatus={saveStatus}
        saveError={saveError}
        onRetrySave={() => setSaveVersion((version) => version + 1)}
        modulesHref={modulesHref}
        testsHref={testsHref}
      />
    );
  }

  const question = module.questions[qIndex];
  const moduleLabel = meta.fullLabel;
  const isMath = section.id === "math";

  const header = (
    <TestHeader
      moduleLabel={moduleLabel}
      isMath={isMath}
      timeLeft={timeLeft}
      timerHidden={timerHidden}
      warning={timeLeft <= 300}
      highlightEnabled={highlightOn}
      onToggleTimer={() => setTimerHidden((h) => !h)}
      onToggleHighlights={() => setHighlightOn((o) => !o)}
      onOpenDirections={() => setOverlay("directions")}
      onOpenReference={() => setOverlay("reference")}
      onOpenCalculator={() => setCalcOpen(true)}
      onOpenLineReader={() => setLineReaderOn(true)}
      onExit={() => router.push(modulesHref)}
    />
  );

  const overlays = (
    <>
      {overlay === "directions" && <DirectionsModal section={section} onClose={() => setOverlay(null)} />}
      {overlay === "reference" && <ReferenceModal onClose={() => setOverlay(null)} />}
      {calcOpen && <CalculatorPanel onClose={() => setCalcOpen(false)} />}
      {lineReaderOn && <LineReader onClose={() => setLineReaderOn(false)} />}
    </>
  );

  if (phase === "review") {
    return (
      <div className="flex h-dvh flex-col bg-exam-bg text-exam-ink">
        {header}
        <PracticeBanner />
        <ReviewPage
          title={`${moduleLabel}: Questions`}
          module={module}
          answers={answers}
          marked={marked}
          onGoto={(i) => {
            setQIndex(i);
            setPhase("module");
          }}
        />
        <FooterNav
          studentName={studentName}
          showCenter={false}
          canBack
          onBack={() => setPhase("module")}
          onNext={() => setPhase("results")}
        />
        {overlays}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-exam-bg text-exam-ink">
      {header}
      <PracticeBanner />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <QuestionScreen
          section={section}
          question={question}
          index={qIndex}
          answer={answers[question.id]}
          marked={Boolean(marked[question.id])}
          eliminated={eliminated[question.id] ?? []}
          eliminatorOn={eliminatorOn}
          highlightEnabled={highlightOn}
          highlights={highlights[question.id] ?? []}
          onSelect={(value: AnswerValue) =>
            setAnswers((a) => ({ ...a, [question.id]: value }))
          }
          onToggleMark={() => setMarked((m) => ({ ...m, [question.id]: !m[question.id] }))}
          onToggleEliminate={(choice: ChoiceId) =>
            setEliminated((e) => {
              const cur = e[question.id] ?? [];
              const next = cur.includes(choice)
                ? cur.filter((c) => c !== choice)
                : [...cur, choice];
              return { ...e, [question.id]: next };
            })
          }
          onToggleEliminator={() => setEliminatorOn((on) => !on)}
          onAddHighlight={(h) => addHighlight(question.id, h)}
          onRemoveHighlight={(s, e) => removeHighlight(question.id, s, e)}
          onSetNote={(id, note) => setHighlightNote(question.id, id, note)}
          promptHighlights={highlights[promptHighlightKey(question.id)] ?? []}
          onAddPromptHighlight={(h) => addHighlight(promptHighlightKey(question.id), h)}
          onRemovePromptHighlight={(s, e) => removeHighlight(promptHighlightKey(question.id), s, e)}
          onSetPromptNote={(id, note) => setHighlightNote(promptHighlightKey(question.id), id, note)}
          calcOpen={calcOpen}
        />

        {navOpen && (
          <QuestionNavigator
            title={`${moduleLabel}: Questions`}
            module={module}
            currentIndex={qIndex}
            answers={answers}
            marked={marked}
            onGoto={(i) => {
              setQIndex(i);
              setNavOpen(false);
            }}
            onGotoReview={() => {
              setPhase("review");
              setNavOpen(false);
            }}
            onClose={() => setNavOpen(false)}
          />
        )}
      </div>

      <FooterNav
        studentName={studentName}
        questionLabel={`Question ${qIndex + 1} of ${module.questions.length}`}
        canBack={qIndex > 0}
        onBack={() => setQIndex((i) => Math.max(0, i - 1))}
        onNext={() => {
          if (qIndex < module.questions.length - 1) setQIndex((i) => i + 1);
          else setPhase("review");
        }}
        onToggleNavigator={() => setNavOpen((o) => !o)}
        navigatorOpen={navOpen}
      />
      {overlays}
    </div>
  );
}
