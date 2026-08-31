import {
  legacyFallbackPlan,
  planForLegacyProductId,
  planForPriceId,
} from "@/lib/billing/config";
import {
  normalizeLegacyPlanCode,
  storedPlanIsUnreadable,
  type PlanCode,
} from "./plans";

// Repairs users.plan rows written before StoredPlan closed the type. Those hold
// a Stripe price nickname, or -- when the price has no nickname -- the raw price
// id, which normalizeLegacyPlanCode reads back as "free". Resolving here fixes
// the affected accounts on their next page load, with no backfill and no
// re-login, and the login path rewrites the row properly the next time they use
// a magic link.
//
// Deliberately silent: getStudentAccess runs on nearly every request, so
// reporting here would flood the logs with one line per page view. The write
// path reports auth.membership.plan_unresolved once per login instead.
export function resolveStoredPlan(stored: string | null | undefined): PlanCode {
  if (!stored) return "free";
  if (!storedPlanIsUnreadable(stored)) return normalizeLegacyPlanCode(stored);

  const value = stored.trim();
  const resolved = planForPriceId(value) ?? planForLegacyProductId(value);
  if (resolved) return resolved;

  // The value is unreadable, but it was only ever written because Stripe
  // confirmed an active subscription at login. "free" is the one answer that
  // is certainly wrong.
  return legacyFallbackPlan();
}
