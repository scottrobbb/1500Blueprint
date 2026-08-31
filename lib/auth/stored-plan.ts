import {
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
// id, which normalizeLegacyPlanCode reads back as "free".
//
// Only values that map to a real plan are honoured. There is deliberately no
// paid fallback here, unlike the write path in getMembership: Stripe confirms
// an active subscription at the moment users.plan is written, but nothing
// clears the row when that subscription later lapses, and legacy members have
// no student_subscriptions rows for effectivePlan to prefer instead. Treating
// an unmappable value as paid therefore grants access off a stale cache --
// which is exactly what it did, handing Max to ~50 lapsed members. At read
// time an unmappable value means the entitlement is unknown, and unknown must
// not manufacture access.
//
// Deliberately silent: getStudentAccess runs on nearly every request, so
// reporting here would flood the logs with one line per page view. The write
// path reports auth.membership.plan_unresolved once per login instead.
export function resolveStoredPlan(stored: string | null | undefined): PlanCode {
  if (!stored) return "free";
  if (!storedPlanIsUnreadable(stored)) return normalizeLegacyPlanCode(stored);

  const value = stored.trim();
  return planForPriceId(value) ?? planForLegacyProductId(value) ?? "free";
}
