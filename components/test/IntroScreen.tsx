"use client";

import { useEffect, useRef, useState } from "react";
import type { PracticeTest } from "@/lib/sat/types";
import type { TimeMultiplier } from "@/lib/sat/testState";
import { Logo } from "@/components/Logo";
import { CloseIcon } from "./icons";

export type ResumeInfo = { sectionLabel: string; timeLabel: string | null };

const TIME_MULTIPLIERS: TimeMultiplier[] = [1, 1.5, 2];

export function IntroScreen({
  test,
  onStart,
  resume,
  onResume,
  onStartOver,
  extendedTime,
  onExtendedTimeChange,
}: {
  test: PracticeTest;
  onStart: () => void;
  resume?: ResumeInfo | null;
  onResume?: () => void;
  onStartOver?: () => void;
  extendedTime: TimeMultiplier;
  onExtendedTimeChange: (multiplier: TimeMultiplier) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftExtendedTime, setDraftExtendedTime] = useState<TimeMultiplier>(extendedTime);
  const settingsDialogRef = useRef<HTMLElement>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    settingsCloseRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        return;
      }
      if (event.key !== "Tab" || !settingsDialogRef.current) return;
      const focusable = [...settingsDialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [settingsOpen]);

  function openSettings() {
    setDraftExtendedTime(extendedTime);
    setSettingsOpen(true);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-exam-bg px-6 py-12">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto mb-8" />
        <h1 className="font-display text-2xl font-bold text-exam-ink">
          {test.title}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-exam-muted">
          This is a full-length, Bluebook-style practice test. Work in a quiet
          place. Once you start a module, the timer runs continuously.
        </p>

        {!resume && (
          <button
            type="button"
            onClick={openSettings}
            className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-exam-blue/30 bg-exam-tint px-4 text-sm font-semibold text-exam-blue transition-colors hover:bg-blue-100"
          >
            <SettingsIcon className="h-4 w-4" />
            Test settings
            {extendedTime !== 1 ? (
              <span className="rounded-full bg-exam-blue px-2 py-0.5 text-[11px] text-white">{extendedTime}x</span>
            ) : null}
          </button>
        )}

        {resume && (
          <div className="mt-6 rounded-xl border border-exam-blue/30 bg-exam-tint px-4 py-4 text-left">
            <p className="text-sm font-semibold text-exam-ink">Resume where you left off</p>
            <p className="mt-1 text-[13px] leading-6 text-exam-muted">
              You stopped at {resume.sectionLabel}.
              {resume.timeLabel
                ? ` Your timer was paused at ${resume.timeLabel} when you left and will pick up from there.`
                : ""}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onResume}
                className="flex-1 rounded-full bg-exam-blue py-2.5 text-sm font-semibold text-white hover:bg-exam-blue-600"
              >
                Resume test
              </button>
              <button
                type="button"
                onClick={onStartOver}
                className="rounded-full border border-exam-line px-4 py-2.5 text-sm font-semibold text-exam-ink hover:bg-exam-bg"
              >
                Start over
              </button>
            </div>
          </div>
        )}

        <dl className="mt-8 space-y-3 text-left">
          {test.sections.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-exam-line px-4 py-3"
            >
              <dt className="text-sm font-semibold text-exam-ink">
                Section {i + 1}: {s.name}
              </dt>
              <dd className="text-sm text-exam-muted">
                2 modules · {Math.round(s.minutesPerModule * extendedTime)} min each
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-xl border border-dashed border-exam-line px-4 py-3">
            <dt className="text-sm font-semibold text-exam-ink">Break</dt>
            <dd className="text-sm text-exam-muted">
              {test.breakMinutes} min between sections
            </dd>
          </div>
          {extendedTime !== 1 ? (
            <div className="flex items-center justify-between rounded-xl border border-exam-blue/25 bg-exam-tint px-4 py-3">
              <dt className="text-sm font-semibold text-exam-ink">Module breaks</dt>
              <dd className="text-sm text-exam-muted">5 min between modules</dd>
            </div>
          ) : null}
        </dl>

        {!resume && (
          <button
            type="button"
            onClick={onStart}
            className="mt-8 w-full rounded-full bg-exam-blue py-3 text-sm font-semibold text-white hover:bg-exam-blue-600"
          >
            Begin Section 1
          </button>
        )}
        <p className="mt-4 text-xs text-exam-muted">
          The second module of each section adjusts in difficulty based on your
          first module, just like the real digital SAT.
        </p>
      </div>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section
            ref={settingsDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="test-settings-title"
            className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <h2 id="test-settings-title" className="font-display text-2xl font-extrabold text-ink">
                Test Settings
              </h2>
              <button
                ref={settingsCloseRef}
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close test settings"
                className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-ink"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </header>

            <div className="px-6 py-6 text-left">
              <h3 className="text-base font-bold text-ink">Test Accommodations</h3>
              <div className="mt-4 space-y-3">
                {TIME_MULTIPLIERS.map((mult) => (
                  <label
                    key={mult}
                    className={`flex cursor-pointer gap-4 rounded-xl border p-5 transition-colors ${
                      draftExtendedTime === mult
                        ? "border-exam-blue bg-exam-tint"
                        : "border-slate-200 bg-slate-50 hover:border-exam-blue/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="time-multiplier"
                      checked={draftExtendedTime === mult}
                      onChange={() => setDraftExtendedTime(mult)}
                      className="mt-0.5 h-6 w-6 shrink-0 accent-exam-blue"
                    />
                    <span>
                      <span className="block text-base font-bold text-ink">
                        {mult === 1 ? "Standard time" : `Extended time (${mult}x)`}
                      </span>
                      {mult === 1 ? (
                        <span className="mt-1 block text-sm leading-6 text-slate-600">
                          Standard module timing, with no extra breaks between modules.
                        </span>
                      ) : (
                        <>
                          <span className="mt-1 block text-sm leading-6 text-slate-600">You will receive:</span>
                          <span className="mt-1 block text-sm leading-6 text-slate-600">
                            • {mult}x time on all test modules<br />
                            • A 5-minute break between Reading &amp; Writing modules<br />
                            • The standard {test.breakMinutes}-minute break between sections<br />
                            • A 5-minute break between Math modules
                          </span>
                        </>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <footer className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="min-h-11 cursor-pointer rounded-lg px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onExtendedTimeChange(draftExtendedTime);
                  setSettingsOpen(false);
                }}
                className="min-h-11 cursor-pointer rounded-lg bg-exam-blue px-6 text-sm font-bold text-white transition-colors hover:bg-exam-blue-600"
              >
                Save Settings
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M19 13.3v-2.6l-2-.7a7.2 7.2 0 00-.7-1.6l.9-1.9-1.8-1.8-1.9.9a7.2 7.2 0 00-1.6-.7l-.7-2H8.7l-.7 2a7.2 7.2 0 00-1.6.7l-1.9-.9-1.8 1.8.9 1.9a7.2 7.2 0 00-.7 1.6l-2 .7v2.6l2 .7c.2.6.4 1.1.7 1.6l-.9 1.9 1.8 1.8 1.9-.9c.5.3 1 .5 1.6.7l.7 2h2.6l.7-2c.6-.2 1.1-.4 1.6-.7l1.9.9 1.8-1.8-.9-1.9c.3-.5.5-1 .7-1.6l1.9-.7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
