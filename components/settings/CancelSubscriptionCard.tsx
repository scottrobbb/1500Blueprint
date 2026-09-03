"use client";

import { useState } from "react";

// The in-app cancellation flow. Confirming does not cancel on its own: the
// server answers the first confirmation with a save offer when one is still
// owed, and only the second confirmation schedules the cancellation. The server
// decides that, not this component, so nothing here can be skipped to reach the
// discount or to dodge the offer.
type Step = "idle" | "confirm" | "offer" | "canceled" | "saved";

type CancelResponse = {
  status?: "offer" | "scheduled" | "already-scheduled";
  offer?: { percentOff: number; renewsAt: string | null };
  accessEndsAt?: string | null;
  error?: string;
};

type OfferResponse = {
  status?: "accepted" | "already-applied";
  percentOff?: number;
  renewsAt?: string | null;
  error?: string;
};

export function CancelSubscriptionCard({ renewsAt }: { renewsAt: string | null }) {
  const [step, setStep] = useState<Step>("idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [percentOff, setPercentOff] = useState(40);
  const [endsAt, setEndsAt] = useState<string | null>(renewsAt);
  const [nextRenewal, setNextRenewal] = useState<string | null>(renewsAt);

  // Every button routes through here, so `pending` disables the whole card for
  // the length of a request. The server is idempotent regardless; this only
  // keeps a double-click from looking like it did nothing.
  async function submit<T>(path: string, onDone: (data: T) => void) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onDone(data);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    void submit<CancelResponse>("/api/billing/subscription/cancel", (data) => {
      if (data.status === "offer") {
        setPercentOff(data.offer?.percentOff ?? 40);
        setNextRenewal(data.offer?.renewsAt ?? renewsAt);
        setStep("offer");
        return;
      }
      setEndsAt(data.accessEndsAt ?? renewsAt);
      setStep("canceled");
    });
  }

  function acceptOffer() {
    void submit<OfferResponse>("/api/billing/subscription/retention-offer", (data) => {
      setPercentOff(data.percentOff ?? percentOff);
      setNextRenewal(data.renewsAt ?? nextRenewal);
      setStep("saved");
    });
  }

  if (step === "saved") {
    return (
      <Panel tone="success">
        <h3 className="font-display text-lg font-extrabold text-navy">
          {percentOff}% off your next renewal is applied
        </h3>
        <p className="mt-1 text-sm font-semibold text-navy/60">
          Your subscription continues{nextRenewal ? ` and renews on ${formatDate(nextRenewal)}` : ""}.
          Nothing was charged today.
        </p>
      </Panel>
    );
  }

  if (step === "canceled") {
    return (
      <Panel tone="warning">
        <h3 className="font-display text-lg font-extrabold text-navy">Cancellation scheduled</h3>
        <p className="mt-1 text-sm font-semibold text-navy/60">
          {endsAt
            ? `You keep full access until ${formatDate(endsAt)}, and you won't be billed again.`
            : "You keep full access until the end of the current billing period, and you won't be billed again."}
        </p>
      </Panel>
    );
  }

  if (step === "offer") {
    return (
      <Panel tone="brand">
        <h3 className="font-display text-lg font-extrabold text-navy">
          Stay and save {percentOff}% on your next renewal.
        </h3>
        <p className="mt-1 text-sm font-semibold text-navy/60">
          {nextRenewal
            ? `Nothing is charged today — the discount comes off your ${formatDate(nextRenewal)} renewal, and your billing date doesn't change.`
            : "Nothing is charged today — the discount comes off your next renewal, and your billing date doesn't change."}
        </p>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton onClick={acceptOffer} disabled={pending}>
            {pending ? "Applying…" : `Stay & Save ${percentOff}%`}
          </PrimaryButton>
          <SecondaryButton onClick={cancel} disabled={pending}>
            Continue Cancellation
          </SecondaryButton>
        </div>
      </Panel>
    );
  }

  if (step === "confirm") {
    return (
      <Panel tone="warning">
        <h3 className="font-display text-lg font-extrabold text-navy">
          Cancel your subscription?
        </h3>
        <p className="mt-1 text-sm font-semibold text-navy/60">
          {renewsAt
            ? `You'll keep full access until ${formatDate(renewsAt)}. After that your account drops to the free plan.`
            : "You'll keep full access until the end of the current billing period. After that your account drops to the free plan."}
        </p>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <SecondaryButton onClick={() => setStep("idle")} disabled={pending}>
            Keep my subscription
          </SecondaryButton>
          <DangerButton onClick={cancel} disabled={pending}>
            {pending ? "Working…" : "Yes, cancel"}
          </DangerButton>
        </div>
      </Panel>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setError("");
        setStep("confirm");
      }}
      className="inline-flex h-10 items-center justify-center rounded-lg border-2 border-navy/10 bg-white px-4 text-sm font-bold text-navy/60 transition-colors hover:border-danger/30 hover:text-danger-600"
    >
      Cancel subscription
    </button>
  );
}

const TONES = {
  brand: "border-brand/25 bg-brand/[0.04]",
  warning: "border-flag/25 bg-flag-bg/40",
  success: "border-success/25 bg-success-bg/40",
} as const;

function Panel({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  // Full width so the expanded flow breaks out of the button row it sits in.
  return <div className={`w-full rounded-2xl border-2 px-5 py-5 sm:px-6 ${TONES[tone]}`}>{children}</div>;
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-3 text-sm font-semibold text-danger-600">
      {children}
    </p>
  );
}

const BUTTON_BASE =
  "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

function PrimaryButton({ onClick, disabled, children }: ButtonProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${BUTTON_BASE} bg-brand text-white hover:bg-brand-600`}>
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, disabled, children }: ButtonProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${BUTTON_BASE} border-2 border-navy/10 bg-white text-navy hover:border-navy/25`}>
      {children}
    </button>
  );
}

function DangerButton({ onClick, disabled, children }: ButtonProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${BUTTON_BASE} bg-danger text-white hover:bg-danger-600`}>
      {children}
    </button>
  );
}

type ButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "your next billing date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
