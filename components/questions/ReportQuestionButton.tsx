"use client";

import { useCallback, useId, useState } from "react";
import { useModalA11y } from "@/components/hub/useModalA11y";
import type {
  QuestionReportTargetType,
  QuestionReportType,
} from "@/lib/question-reports/input";

const REPORT_OPTIONS: { value: QuestionReportType; label: string }[] = [
  { value: "wrong-answer", label: "Wrong answer marked as correct" },
  { value: "incorrect-explanation", label: "Explanation is incorrect or unclear" },
  { value: "formatting", label: "Formatting or display issue" },
  { value: "other", label: "Something else" },
];

type ReportQuestionButtonProps = {
  questionId: string;
  targetType: QuestionReportTargetType;
  className?: string;
  compact?: boolean;
};

export function ReportQuestionButton(props: ReportQuestionButtonProps) {
  return (
    <ReportQuestionControl
      key={`${props.targetType}:${props.questionId}`}
      {...props}
    />
  );
}

function ReportQuestionControl({
  questionId,
  targetType,
  className = "",
  compact = false,
}: ReportQuestionButtonProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<QuestionReportType>("incorrect-explanation");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => {
    if (!submitting) setOpen(false);
  }, [submitting]);
  const dialogRef = useModalA11y(open, close);

  async function submitReport() {
    const details = comment.trim();
    if (details.length < 3 || submitting) {
      setError("Add a few details about the issue.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/questions/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, targetType, reportType, comment: details }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "The report could not be submitted.");
      setSubmitted(true);
      setOpen(false);
      setComment("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The report could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        disabled={submitted}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-navy/15 bg-white px-2.5 text-xs font-semibold text-navy/60 transition-colors hover:border-navy/30 hover:bg-navy/[0.04] hover:text-navy disabled:cursor-default disabled:border-success/20 disabled:bg-success-bg disabled:text-success-600 ${className}`}
      >
        {submitted ? <CheckIcon /> : <FlagIcon />}
        {!compact ? <span>{submitted ? "Reported" : "Report"}</span> : null}
        {compact ? <span className="sr-only">{submitted ? "Question reported" : "Report question"}</span> : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close report dialog"
            onClick={close}
            className="absolute inset-0 cursor-default bg-navy/55 backdrop-blur-[2px]"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative z-10 w-full max-w-md rounded-2xl border border-navy/10 bg-white p-5 text-left shadow-2xl outline-none sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="font-display text-xl font-extrabold text-navy">
                  Report this question
                </h2>
                <p className="mt-1 text-sm leading-5 text-navy/55">
                  Tell us what looks wrong. Your report will include this question for the content team.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={submitting}
                onClick={close}
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-navy/45 transition-colors hover:bg-navy/5 hover:text-navy disabled:opacity-40"
              >
                <CloseIcon />
              </button>
            </div>

            <label className="mt-5 block text-sm font-bold text-navy">
              What is the issue?
              <select
                data-autofocus
                value={reportType}
                disabled={submitting}
                onChange={(event) => setReportType(event.target.value as QuestionReportType)}
                className="mt-2 min-h-11 w-full rounded-xl border border-navy/20 bg-white px-3 text-sm font-medium text-navy outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-60"
              >
                {REPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-sm font-bold text-navy">
              What should we know?
              <textarea
                value={comment}
                disabled={submitting}
                maxLength={2_000}
                rows={4}
                placeholder="Describe where the answer, explanation, or formatting looks wrong."
                onChange={(event) => {
                  setComment(event.target.value);
                  if (error) setError(null);
                }}
                className="mt-2 w-full resize-y rounded-xl border border-navy/20 bg-white px-3 py-2.5 text-sm leading-6 text-navy outline-none transition-colors placeholder:text-navy/35 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-60"
              />
            </label>

            {error ? (
              <p role="alert" className="mt-3 rounded-xl border border-danger/20 bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-600">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={close}
                className="min-h-11 rounded-xl px-4 text-sm font-bold text-navy/60 transition-colors hover:bg-navy/5 hover:text-navy disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || comment.trim().length < 3}
                onClick={() => void submitReport()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-navy px-5 text-sm font-extrabold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:bg-navy/20"
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-4 w-4">
      <path d="M6 21V4m0 1h9.2l-1.4 3 1.4 3H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-4 w-4">
      <path d="m5 12.5 4.2 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-5 w-5">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
