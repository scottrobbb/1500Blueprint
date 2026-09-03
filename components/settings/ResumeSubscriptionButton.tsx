"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Stripe's portal used to carry the "don't cancel after all" button next to its
// cancel button. Cancelling is an in-app flow now and that portal button is
// switched off with it, so this is the way back from a cancellation a student
// scheduled by mistake.
export function ResumeSubscriptionButton({ accessEndsAt }: { accessEndsAt: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function resume() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/billing/subscription/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full">
      <p className="text-sm font-semibold text-navy/60">
        {accessEndsAt
          ? "Your subscription is set to end. Keep it and billing carries on as normal."
          : "Your subscription is set to end at the close of this billing period."}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger-600">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void resume()}
        disabled={pending}
        className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Working…" : "Keep my subscription"}
      </button>
    </div>
  );
}
