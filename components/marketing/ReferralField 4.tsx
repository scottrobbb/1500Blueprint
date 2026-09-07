"use client";

import { useEffect, useState } from "react";
import { whenReferralResolved } from "@/lib/marketing/rewardful";

// The affiliate referral, as a form field React owns.
//
// Rewardful's own data-rewardful attribute injects this input into the DOM
// itself, which does not survive a React re-render of the surrounding form --
// and the pricing form re-renders on every monthly/3-month toggle. Rendering it
// from state instead means the value is still there whenever the student
// actually submits.
export function ReferralField({ onResolved }: { onResolved?: () => void }) {
  const [referral, setReferral] = useState<string | null>(null);

  useEffect(() => whenReferralResolved((value) => {
    setReferral(value);
    onResolved?.();
    // onResolved is only ever the caller's "stop waiting" signal, and re-running
    // this on a new function identity would restart the wait on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  return referral ? <input type="hidden" name="referral" value={referral} /> : null;
}
