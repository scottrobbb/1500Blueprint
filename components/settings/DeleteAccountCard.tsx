"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanCode } from "@/lib/auth/entitlements";

function planName(plan: PlanCode): string {
  if (plan === "max") return "Blueprint Max";
  if (plan === "core") return "Blueprint Core";
  return "Blueprint";
}

export function DeleteAccountCard({ plan }: { plan: PlanCode }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const paid = plan === "max" || plan === "core";
  const name = planName(plan);

  useEffect(() => {
    if (!confirming) return;
    cancelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirming(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming]);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" } });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Your account could not be deleted.");
      // A document load rather than a router push, on purpose: the router
      // cache in this tab holds pages rendered for an account that no longer
      // exists, and only a fresh load is guaranteed to drop all of it.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/pricing";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your account could not be deleted.");
      setDeleting(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-danger/25 bg-danger-bg/60 p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold text-navy">Delete account</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-navy/60">
        Permanently delete your account and everything in it, including your scores, practice history, course progress,
        and flashcards.{paid ? ` Your ${name} subscription is cancelled at the same time.` : ""}
      </p>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 min-h-11 cursor-pointer rounded-xl bg-danger px-5 text-sm font-extrabold text-white transition-colors hover:bg-danger-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-600"
      >
        Delete account
      </button>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-shell-950/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setConfirming(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-7"
          >
            <h2 id="delete-account-title" className="font-display text-xl font-extrabold text-ink">
              Delete your account?
            </h2>
            <p className="mt-3 text-sm leading-6 text-navy/65">
              {paid
                ? `This will immediately cancel your ${name} subscription and permanently delete your account. You'll lose access to ${name} immediately. This action cannot be undone.`
                : "This will permanently delete your account and everything in it, including your scores, practice history, course progress, and flashcards. This action cannot be undone."}
            </p>
            {error ? (
              <p role="alert" className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-600">{error}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                disabled={deleting}
                onClick={() => setConfirming(false)}
                className="min-h-11 cursor-pointer rounded-xl border border-navy/15 bg-white px-5 text-sm font-extrabold text-navy transition-colors hover:border-navy/30 disabled:opacity-60"
              >
                Keep my account
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void remove()}
                className="min-h-11 cursor-pointer rounded-xl bg-danger px-5 text-sm font-extrabold text-white transition-colors hover:bg-danger-600 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
