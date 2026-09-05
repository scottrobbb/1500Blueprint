"use client";

import { useEffect, useRef } from "react";
import type { BillingCadence } from "@/lib/billing/offers";
import type { BillablePlan } from "@/lib/billing/config";

declare global {
  interface Window {
    rewardful?: (action: string, ...args: unknown[]) => void;
  }
}

// How long to wait for Rewardful before posting without a referral.
const REWARDFUL_WAIT_MS = 2000;

// Checkout is created by a POST so it keeps the same-origin check and the
// reservation/rate-limit pipeline in /api/billing/checkout. A redirect after
// login can only be a GET, so this posts the preserved plan on arrival.
export function CheckoutRedirect({
  plan,
  cadence,
  checkoutToken,
  returnTo,
}: {
  plan: BillablePlan;
  cadence: BillingCadence;
  checkoutToken: string;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    const submit = () => {
      // React runs effects twice in development; a second POST would claim a
      // second reservation for the same purchase.
      if (submitted.current) return;
      submitted.current = true;
      formRef.current?.requestSubmit();
    };

    // Rewardful writes the hidden referral input when it attaches to this form,
    // and this form posts itself the moment it mounts -- so submitting before
    // their script is ready silently drops the affiliate's commission. The
    // timeout is the load-bearing half: rw.js is third-party and an ad blocker
    // can stop it dead, and no student is going to wait on a tracking script to
    // reach checkout.
    const timer = window.setTimeout(submit, REWARDFUL_WAIT_MS);
    window.rewardful?.("ready", () => {
      window.clearTimeout(timer);
      submit();
    });
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <form
      ref={formRef}
      action="/api/billing/checkout"
      method="post"
      className="text-center"
      data-rewardful="true"
    >
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="cadence" value={cadence} />
      <input type="hidden" name="checkoutToken" value={checkoutToken} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <p className="text-sm text-navy/60" role="status">Taking you to secure checkout…</p>
      {/* Also the path for anyone whose browser blocks the automatic submit. */}
      <button
        type="submit"
        className="mt-5 min-h-11 rounded-xl bg-brand px-6 text-sm font-extrabold text-white hover:bg-brand-600"
      >
        Continue to checkout
      </button>
    </form>
  );
}
