"use client";

import { useEffect, useRef } from "react";
import type { BillingCadence } from "@/lib/billing/offers";
import type { BillablePlan } from "@/lib/billing/config";

// Checkout is created by a POST so it keeps the same-origin check and the
// reservation/rate-limit pipeline in /api/billing/checkout. A redirect after
// login can only be a GET, so this posts the preserved plan on arrival.
export function CheckoutRedirect({
  plan,
  cadence,
  checkoutToken,
}: {
  plan: BillablePlan;
  cadence: BillingCadence;
  checkoutToken: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    // React runs effects twice in development; a second POST would claim a
    // second reservation for the same purchase.
    if (submitted.current) return;
    submitted.current = true;
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action="/api/billing/checkout" method="post" className="text-center">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="cadence" value={cadence} />
      <input type="hidden" name="checkoutToken" value={checkoutToken} />
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
