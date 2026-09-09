"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DrillShell } from "../shared/DrillShell";
import type { ReadingHistory, ReadingMode } from "@/lib/dense-reading/types";
import { formatReadingTime } from "@/lib/dense-reading/method";
import { ReadingButton, ReadingDialog, surface } from "./ui";

export function DenseReadingLibrary({
  history,
  unavailable = false,
}: {
  history: ReadingHistory[];
  unavailable?: boolean;
}) {
  const router = useRouter();
  const [start, setStart] = useState<{
    repeatId?: string;
    token: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = history.find((row) => row.status === "active");
  const completed = history.filter((row) => row.status === "completed");
  async function begin(mode: ReadingMode) {
    if (!start || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/drills/dense-reading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: start.token,
          mode,
          repeatId: start.repeatId,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "The round could not be started.");
      router.push(`/drills/dense-reading/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
      setBusy(false);
    }
  }
  return (
    <DrillShell
      title="Dense Reading"
      exitHref="/ultimate/drills"
      exitLabel="Drills"
    >
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-navy">
            Dense Reading
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-navy/65">
            Work through 11 reading questions. Build a prediction, weigh every
            word, and review the reasoning behind your answers.
          </p>
        </header>
        <section className={`${surface} p-5 sm:p-7`}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-navy">
                {active ? "Continue your round" : "Start a reading round"}
              </h2>
              <p className="mt-2 text-sm text-navy/60">
                {active
                  ? `${active.mode === "guided" ? "Guided" : "Regular"} practice · ${active.total} questions · progress saved`
                  : "Guided or regular practice · Highlighting and notes · Saved results"}
              </p>
            </div>
            {active ? (
              <Link
                className="inline-flex min-h-11 items-center rounded-lg bg-navy px-5 text-sm font-semibold text-white"
                prefetch={false}
                href={`/drills/dense-reading/${active.id}`}
              >
                Resume practice
              </Link>
            ) : (
              <ReadingButton
                disabled={unavailable}
                onClick={() => setStart({ token: crypto.randomUUID() })}
              >
                Start practice
              </ReadingButton>
            )}
          </div>
          {unavailable ? (
            <p role="alert" className="mt-4 text-sm text-danger-600">
              Dense Reading is temporarily unavailable. Please try again later.
            </p>
          ) : null}
        </section>
        <section id="history" className="mt-10" aria-label="Reading history">
          <h2 className="mb-4 font-display text-xl font-semibold text-navy">
            Your rounds
          </h2>
          {completed.length ? (
            <div className="space-y-3">
              {completed.map((row) => (
                <article
                  key={row.id}
                  className={`${surface} flex flex-wrap items-center justify-between gap-4 p-5`}
                >
                  <div>
                    <h3 className="font-semibold text-navy">
                      {row.correct} of {row.total} correct{" "}
                      <span className="ml-2 text-sm font-normal text-navy/60">
                        {Math.round((row.correct / row.total) * 100)}%
                      </span>
                    </h3>
                    <p className="mt-1 text-sm text-navy/60">
                      {row.mode === "guided" ? "Guided" : "Regular"} ·{" "}
                      {new Date(
                        row.completedAt ?? row.createdAt,
                      ).toLocaleDateString()}{" "}
                      · {formatReadingTime(row.elapsedMs)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      prefetch={false}
                      href={`/drills/dense-reading/${row.id}`}
                      className="inline-flex min-h-11 items-center rounded-lg border border-navy/20 px-4 text-sm font-semibold text-navy"
                    >
                      View results
                    </Link>
                    <ReadingButton
                      secondary
                      disabled={Boolean(active)}
                      onClick={() =>
                        setStart({
                          repeatId: row.id,
                          token: crypto.randomUUID(),
                        })
                      }
                    >
                      Redo round
                    </ReadingButton>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-navy/60">
              Your completed rounds and reading analytics will appear here.
            </p>
          )}
        </section>
      </div>
      {start ? (
        <ReadingDialog
          title="Choose how to practice"
          onClose={() => {
            if (!busy) {
              setStart(null);
              setError(null);
            }
          }}
        >
          <p className="mb-5 text-sm leading-6 text-navy/65">
            Your mode stays fixed for this round.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["guided", "regular"] as const).map((mode) => (
              <div
                key={mode}
                className="flex flex-col rounded-xl border border-navy/15 p-4"
              >
                <h3 className="font-display text-lg font-semibold text-navy">
                  {mode === "guided" ? "Guided practice" : "Regular practice"}
                </h3>
                <p className="mb-5 mt-2 text-sm leading-6 text-navy/65">
                  {mode === "guided"
                    ? "Follow the reading process, write a prediction, and evaluate choices word by word. Submitted answers are locked."
                    : "Read at your own pace, navigate freely, and change your answers before submitting the round."}
                </p>
                <ReadingButton
                  className="mt-auto"
                  secondary={mode === "regular"}
                  disabled={busy}
                  onClick={() => void begin(mode)}
                >
                  {busy ? "Starting…" : `Start ${mode}`}
                </ReadingButton>
              </div>
            ))}
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-danger-600">
              {error}
            </p>
          ) : null}
        </ReadingDialog>
      ) : null}
    </DrillShell>
  );
}
