// Browser-side half of the Rewardful integration. The server half -- validating
// the referral and recording it on the Stripe customer -- is in lib/billing/referrals.ts.

declare global {
  interface Window {
    rewardful?: (action: string, ...args: unknown[]) => void;
    Rewardful?: { referral?: string };
  }
}

// How long to wait for rw.js before giving up on a referral. It is a
// third-party script an ad blocker can stop dead, so every caller needs an
// answer either way rather than a promise that never settles.
export const REWARDFUL_WAIT_MS = 2000;

// Calls back exactly once with the visitor's referral, or null when there is
// none -- no affiliate involved, or the script never loaded. Returns a cleanup
// function for useEffect.
export function whenReferralResolved(
  onResolved: (referral: string | null) => void,
  timeoutMs = REWARDFUL_WAIT_MS,
): () => void {
  let settled = false;
  const settle = (referral: string | null) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    onResolved(referral);
  };

  const timer = window.setTimeout(() => settle(null), timeoutMs);
  // Optional call: if the queue snippet was blocked too, only the timeout runs.
  window.rewardful?.("ready", () => settle(window.Rewardful?.referral || null));
  return () => window.clearTimeout(timer);
}
