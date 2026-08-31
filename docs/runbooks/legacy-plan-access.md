# Legacy plan access

Why some members get the wrong entitlement, what has been changed so far, and what
is still outstanding. Written as a handoff: everything needed to continue is here.

Per `incident-response.md`, no member emails are recorded in this file. Keep the
affected addresses in the incident thread, not in git.

## Status

| | |
|---|---|
| Members with an active subscription wrongly on free | **Fixed** (PR #16) |
| Members with no active subscription wrongly on Max | **Partly fixed** (PR #17) — a cohort remains |
| Permanent repair | **Not run** — `scripts/reconcile-legacy-plans.ts` exists, has never been executed |

## How access is decided

`getStudentAccess` in `lib/auth/entitlements.ts` reads four sources, in this order:

1. **Test persona** — `users.is_test_account` + `users.test_persona`. Short-circuits
   everything else before any other source is read (`accessForTestPersona`).
2. **`access_grants`** — an unrevoked, in-window row. Written by the students admin
   panel (`/ultimate/admin/students`).
3. **`student_subscriptions`** — Stripe-synced. Counts as paid when `status` is
   `active`, `trialing`, or **`past_due`**, and `livemode` matches `billingLivemode()`.
4. **`users.plan`** — the legacy value.

They combine in `effectivePlan` (`lib/auth/plans.ts`):

```ts
if (grant || subscription) return highestPlan(grant ?? "free", subscription ?? "free");
return hasTrackedSubscription ? "free" : legacy;
```

Read that second line carefully. `users.plan` is consulted **only** when the member
has no grant, no active subscription, *and no `student_subscriptions` rows at all*.
That is precisely the legacy population — members who paid before the current billing
system existed and were never synced into `student_subscriptions`.

## The root defect

`users.plan` is a **write-once cache with no expiry**.

- It is written only by `recordLogin`, on the magic-link path
  (`app/api/auth/callback/route.ts`), and only after `getMembership` confirmed an
  active Stripe subscription.
- Password login does **not** refresh it. `recordPasswordLogin`
  (`lib/auth/accounts.ts`) never consults Stripe.
- **Nothing clears it when a subscription lapses.**

So the row records what Stripe said at some past login and then grants access
forever. An active legacy member and a lapsed one are byte-identical in the
database — the same `users.plan` string, no subscription rows either way.

**No read-path logic can separate them.** The information is not present. Any rule
applied there necessarily errs in one direction for the whole cohort. This is the
single most important fact in this document; two failed attempts below both came
from ignoring it.

## What was wrong, and what each change did

### PR #16 — active members were landing on free

`getMembership` (`lib/auth/stripe.ts`) stored a **display value** where the
entitlement layer expects a **plan code**:

```ts
return { active: true, plan: price?.nickname ?? price?.id ?? null };
```

`normalizeLegacyPlanCode` parses that by substring-matching `"max"` / `"core"` and
returns `"free"` on no match. A Stripe price with no nickname stored a raw
`price_...` id, matched neither, and the member silently became free — while Stripe
had confirmed the subscription active, which is the only reason they received a
login link at all.

Three changes:

1. **`StoredPlan` closed the type** (`lib/auth/plans.ts`). `users.plan` may only be
   written as a `PlanCode` or one of four sentinels (`testing`, `complimentary`,
   `admin`, `dev`). Storing a Stripe display value is now a compile error.
2. **`getMembership` resolves at the boundary** — configured price id, then legacy
   product id, then a nickname that actually names its tier. The billing webhook
   (`lib/billing/subscriptions.ts`) already resolved this way; the login path never
   did. Unresolvable actives log `auth.membership.plan_unresolved` and take
   `STRIPE_LEGACY_FALLBACK_PLAN` (default `max`).
3. **`resolveStoredPlan`** (`lib/auth/stored-plan.ts`) repairs already-written rows
   at read time.

This fixed the reported member and the free-tier direction generally.

### PR #17 — the same change over-granted ~50 members

`resolveStoredPlan` also applied the paid fallback, on this reasoning:

> The value is unreadable, but it was only ever written because Stripe confirmed an
> active subscription at login.

True when the row is **written**. False when it is **read** — see the root defect
above. Every lapsed legacy member holding an unmappable price id was handed Max off
a stale cache. Before PR #16 those rows resolved to free.

PR #17 removed the fallback from the read path only. It now honours a stored value
only when it maps to a real plan:

```ts
export function resolveStoredPlan(stored: string | null | undefined): PlanCode {
  if (!stored) return "free";
  if (!storedPlanIsUnreadable(stored)) return normalizeLegacyPlanCode(stored);
  const value = stored.trim();
  return planForPriceId(value) ?? planForLegacyProductId(value) ?? "free";
}
```

The fallback remains on the **write** path in `getMembership`, where Stripe has just
confirmed the subscription is live. That distinction is the whole point; do not
reintroduce a fallback here. `lib/auth/stored-plan.test.ts` pins it.

## What is still broken

PR #17 only covered **unmappable** values. A lapsed member whose stored value *reads*
as paid still has access:

| `users.plan` | Reads as | After PR #17 |
|---|---|---|
| `price_1ABC...` (unmappable) | — | free ✅ |
| `"Blueprint Max Monthly"` | contains `"max"` | **Max** ❌ |
| `"testing"` / `"admin"` / `"dev"` | sentinel | **Max** ❌ |

Same staleness, different branch of the same function.

### Find the cohort

This mirrors exactly the population `effectivePlan` falls through to legacy for:

```sql
select u.plan, count(*) as students
from users u
where u.account_status = 'active'
  and u.plan is not null
  and not exists (select 1 from access_grants g
                  where g.user_id = u.id and g.revoked_at is null
                    and (g.expires_at is null or g.expires_at > now()))
  and not exists (select 1 from student_subscriptions s where s.user_id = u.id)
group by u.plan order by count(*) desc;
```

### Diagnose one member

```sql
select u.email, u.plan, u.account_status, u.is_test_account, u.test_persona,
       g.plan_code as grant_plan, g.source, g.expires_at, g.revoked_at,
       s.plan_code as sub_plan, s.status, s.livemode
from users u
left join access_grants g on g.user_id = u.id and g.revoked_at is null
left join student_subscriptions s on s.user_id = u.id
where u.email = '<email>';
```

Check the sources in the order listed at the top. A test persona or an active grant
short-circuits everything, and `past_due` counts as paid by design.

## Next step: reconcile against Stripe

`scripts/reconcile-legacy-plans.ts` (PR #18) is the permanent repair. Stripe is the
only source that knows whether a legacy member is still paying, so it asks per
member and rewrites the row.

```bash
# read-only, prints every proposed change
npx tsx --env-file=.env.local scripts/reconcile-legacy-plans.ts

# apply, after reading the dry run
npx tsx --env-file=.env.local scripts/reconcile-legacy-plans.ts --write
```

Needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STRIPE_RESTRICTED_KEY`
(`vercel env pull .env.local`).

Scope: only members whose access comes from `users.plan` alone. Anyone holding a
grant or a subscription row is governed by a live source and is skipped.

- No active subscription → clears `users.plan`, dropping them to free
- Still paying → rewrites the nickname or price id to a real plan code
- Already correct → untouched

**Read the dry run before writing.** It removes paid access from real accounts.

## Also verify: the membership bypass

`lib/auth/stripe.ts` carries a testing bypass:

```ts
// TEMPORARY (testing only): when MEMBERSHIP_REQUIRE_ACTIVE_SUB=false, any existing
// Stripe customer counts as a member — no subscription required. Remove that env
// var to restore the active-subscription gate before real students use this.
if (process.env.MEMBERSHIP_REQUIRE_ACTIVE_SUB === "false") {
  return { active: true, plan: "testing" };
}
```

If that variable is set in production, **any past Stripe customer** — cancelled,
refunded, anyone — logs in as a member, and `"testing"` maps to Max. Reconciliation
would clear those rows, but the next login would re-grant them. Confirm it is unset
before treating the data fix as complete. A large `testing` count in the cohort query
is the tell.

## Immediate mitigation

`/ultimate/admin/students` → **Complimentary Max access** grants or revokes Max per
member in seconds, writing to `access_grants`. It outranks `users.plan` and is
reversible, so it is the right tool for restoring a member wrongly dropped, or for
comping someone while a root cause is still being worked.

Do **not** use the older `/admin/access` page for this. It writes
`users.plan = 'complimentary'`, which `effectivePlan` ignores entirely for anyone
who has ever held a Stripe subscription.

## Follow-ups

- Set `STRIPE_LEGACY_CORE_PRODUCT_IDS` / `STRIPE_LEGACY_MAX_PRODUCT_IDS` from
  `auth.membership.plan_unresolved` log entries. Each one names a price whose product
  is missing from the mapping; adding it makes that price resolve exactly instead of
  taking the fallback.
- `STRIPE_LEGACY_FALLBACK_PLAN` defaults to `max`. Set it to `core` to err toward
  under-granting.
- The durable end state is backfilling legacy members into `student_subscriptions`
  so `users.plan` stops being an access source at all. Reconciliation is a
  point-in-time fix; without a live source these rows go stale again the moment
  someone cancels.
