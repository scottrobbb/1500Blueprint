"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  AdminQuestionReport,
  QuestionReportStatus,
} from "@/lib/question-reports/queries";

type StatusFilter = "all" | QuestionReportStatus;
type TargetFilter = "all" | AdminQuestionReport["targetType"];

const STATUS_LABELS: Record<QuestionReportStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const TYPE_LABELS: Record<AdminQuestionReport["reportType"], string> = {
  "wrong-answer": "Wrong answer",
  "incorrect-explanation": "Explanation issue",
  formatting: "Formatting issue",
  other: "Other issue",
};

export function QuestionReportsPanel({
  initialReports,
  adminBasePath,
}: {
  initialReports: AdminQuestionReport[];
  adminBasePath: "/admin" | "/ultimate/admin";
}) {
  const [reports, setReports] = useState(initialReports);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [target, setTarget] = useState<TargetFilter>("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => ({
    total: reports.length,
    open: reports.filter((report) => report.status === "open").length,
    resolved: reports.filter((report) => report.status === "resolved").length,
    dismissed: reports.filter((report) => report.status === "dismissed").length,
  }), [reports]);

  const visibleReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (status !== "all" && report.status !== status) return false;
      if (target !== "all" && report.targetType !== target) return false;
      if (!query) return true;
      return [
        report.comment,
        report.reporterEmail,
        report.question.prompt,
        report.question.passage,
        report.question.context,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [reports, search, status, target]);

  async function changeStatus(reportId: string, nextStatus: QuestionReportStatus) {
    if (updatingId) return;
    setUpdatingId(reportId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/question-reports/${reportId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "The report could not be updated.");
      setReports((current) => current.map((report) => (
        report.id === reportId
          ? {
              ...report,
              status: nextStatus,
              resolvedAt: nextStatus === "open" ? null : new Date().toISOString(),
            }
          : report
      )));
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "The report could not be updated.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-navy">
            Question reports
          </h1>
          <p className="mt-1 text-sm text-navy/55">
            Review student feedback beside the exact question, then resolve or dismiss it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Report totals">
          <CountPill label="Open" value={counts.open} tone="open" />
          <CountPill label="Resolved" value={counts.resolved} tone="resolved" />
          <CountPill label="Dismissed" value={counts.dismissed} tone="muted" />
          <CountPill label="Total" value={counts.total} tone="muted" />
        </div>
      </div>

      <div className="grid gap-3 rounded-card border border-navy/15 bg-white p-4 md:grid-cols-[1fr_180px_180px]">
        <label className="text-sm font-bold text-navy">
          Search reports
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Question, student, or report text"
            className="mt-2 min-h-11 w-full rounded-xl border border-navy/20 bg-white px-3 text-sm font-medium text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>
        <label className="text-sm font-bold text-navy">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="mt-2 min-h-11 w-full rounded-xl border border-navy/20 bg-white px-3 text-sm font-medium text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
        <label className="text-sm font-bold text-navy">
          Question source
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value as TargetFilter)}
            className="mt-2 min-h-11 w-full rounded-xl border border-navy/20 bg-white px-3 text-sm font-medium text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          >
            <option value="all">All questions</option>
            <option value="question-bank">Question bank</option>
            <option value="practice-test">Practice tests</option>
          </select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-600">
          {error}
        </p>
      ) : null}

      {visibleReports.length === 0 ? (
        <div className="rounded-card border border-dashed border-navy/20 bg-mist px-4 py-14 text-center">
          <p className="font-display text-base font-bold text-navy">No matching reports</p>
          <p className="mt-1 text-sm text-navy/50">
            {reports.length === 0
              ? "Student question reports will appear here."
              : "Try another status, source, or search."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              adminBasePath={adminBasePath}
              updating={updatingId === report.id}
              onStatus={(nextStatus) => void changeStatus(report.id, nextStatus)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportCard({
  report,
  adminBasePath,
  updating,
  onStatus,
}: {
  report: AdminQuestionReport;
  adminBasePath: string;
  updating: boolean;
  onStatus: (status: QuestionReportStatus) => void;
}) {
  const editHref = report.question.targetPath
    ? `${adminBasePath}${report.question.targetPath}`
    : null;
  return (
    <li className="overflow-hidden rounded-card border border-navy/15 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-navy/10 bg-haze/60 px-4 py-3">
        <StatusBadge status={report.status} />
        <span className="rounded-full bg-navy/[0.07] px-2.5 py-1 text-xs font-bold text-navy/65">
          {TYPE_LABELS[report.reportType]}
        </span>
        <span className="text-xs font-semibold text-navy/45">
          {report.targetType === "question-bank" ? "Question bank" : "Practice test"}
        </span>
        <span className="ml-auto text-xs text-navy/45">
          {formatDate(report.createdAt)}
        </span>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)] lg:p-5">
        <div className="min-w-0">
          <p className="text-xs font-bold text-navy/45">Student report</p>
          <blockquote className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-navy">
            {report.comment}
          </blockquote>
          <p className="mt-3 truncate text-xs text-navy/45" title={report.reporterEmail}>
            Reported by {report.reporterEmail}
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-navy/10 bg-paper p-4">
          <p className="text-xs font-bold text-navy/45">Reported question</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-brand-600">
            {report.question.context}
          </p>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-navy">
            {report.question.prompt}
          </p>
          {editHref ? (
            <Link
              href={editHref}
              className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-navy/15 bg-white px-3 text-sm font-bold text-navy transition-colors hover:border-brand/30 hover:bg-brand/5"
            >
              Open question editor
            </Link>
          ) : (
            <p className="mt-3 text-xs font-semibold text-danger-600">Question is unavailable.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-navy/10 px-4 py-3">
        {report.status !== "open" ? (
          <ActionButton disabled={updating} onClick={() => onStatus("open")}>
            Reopen
          </ActionButton>
        ) : (
          <>
            <ActionButton disabled={updating} onClick={() => onStatus("dismissed")}>
              Dismiss
            </ActionButton>
            <ActionButton primary disabled={updating} onClick={() => onStatus("resolved")}>
              {updating ? "Updating…" : "Mark resolved"}
            </ActionButton>
          </>
        )}
      </div>
    </li>
  );
}

function CountPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "open" | "resolved" | "muted";
}) {
  const colors = tone === "open"
    ? "border-gold/25 bg-gold/10 text-flag"
    : tone === "resolved"
      ? "border-success/20 bg-success-bg text-success-600"
      : "border-navy/10 bg-white text-navy/55";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${colors}`}>
      {value} {label}
    </span>
  );
}

function StatusBadge({ status }: { status: QuestionReportStatus }) {
  const colors = status === "open"
    ? "bg-gold/15 text-flag"
    : status === "resolved"
      ? "bg-success-bg text-success-600"
      : "bg-navy/[0.08] text-navy/55";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 rounded-xl px-3.5 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-50 ${
        primary
          ? "bg-navy text-white hover:bg-navy/90"
          : "border border-navy/15 bg-white text-navy/65 hover:bg-navy/5 hover:text-navy"
      }`}
    >
      {children}
    </button>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
