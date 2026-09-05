This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Ultimate private workspace

The integrated Ultimate workspace lives at `/ultimate` in this same application. It uses the existing authentication, Supabase data, feature APIs, student ownership, and admin tools.

- Emails in `ADMIN_EMAILS` can access it automatically.
- `/ultimate` is the authenticated student workspace. Free, Core, and Max access is enforced by server-side plan entitlements inside the workspace.
- Signed-in users outside both allowlists are redirected to `/drills`.
- No separate database or content migration is required.

## Password account rollout

Password accounts run alongside the existing member magic-link flow. The
current `/login` page and its Stripe membership check remain unchanged.

1. Apply `supabase/migrations/20260820130000_student_accounts_and_entitlements.sql`.
2. Add `/account/confirm` to the allowed Supabase Auth redirect URLs.
3. Set `PASSWORD_AUTH_ENABLED=true` in production to enable password login,
   recovery, and account claiming.
4. Set `PASSWORD_SIGNUP_ENABLED=true` separately when public Free registration
   is ready to open and server-side plan entitlements are enforced across the
   existing drills, tests, courses, and planner routes.

Keep `PASSWORD_SIGNUP_ENABLED=true` while public Free registration is open.
Password login can still be enabled independently for existing students by
turning signup off.

Both flows are available by default during local development and can be forced
off there by setting either flag to `false`.

Vercel Preview auth links use the deployment's `VERCEL_URL` automatically. Set
`AUTH_PREVIEW_URL` only when a stable public preview alias should replace that
deployment-specific URL, and allow the preview `/account/confirm` URL in Supabase
Auth redirect settings before testing registration.

## Stripe billing

Core is $50 monthly or $120 every three months. Max is $80 monthly or $210
every three months. Checkout stays closed unless billing is explicitly launched
with a complete mode, webhook, key, and Price configuration.

The existing Blueprint Stripe product is Max. The sandbox setup command requires
its current monthly Price in `STRIPE_MAX_PRICE_ID`, creates only the Core product,
and ensures the canonical monthly and three-month Prices exist on both products.
Runtime checkout never creates Stripe catalog objects.

```text
NEXT_PUBLIC_APP_URL=https://1500blueprint.com
APP_ALLOWED_ORIGINS=https://1500blueprint.com,https://www.1500satblueprint.com
BILLING_ENABLED=false
STRIPE_BILLING_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_BILLING_MODE=live
STRIPE_CORE_PRICE_ID=
STRIPE_CORE_THREE_MONTH_PRICE_ID=
STRIPE_MAX_PRICE_ID=
STRIPE_MAX_THREE_MONTH_PRICE_ID=
STRIPE_LEGACY_MAX_PRODUCT_IDS=
```

`NEXT_PUBLIC_APP_URL` is the single canonical production origin. During a
domain overlap, `APP_ALLOWED_ORIGINS` may contain up to eight exact HTTPS
origins separated by commas. Billing mutations, Checkout return URLs, and the
billing portal accept only the current request origin when it exactly matches
that list; wildcards, paths, ports, credentials, and unlisted deployment hosts
are rejected.

Provision sandbox Core and Max Prices only after `STRIPE_MAX_PRICE_ID` points to
an existing Blueprint sandbox Price:

```bash
npx tsx --env-file=.env.local scripts/setup-stripe-billing.ts
```

The command prints the canonical Product and Price IDs to copy into the sandbox
environment. It never accepts a live key. Reconcile legacy subscribers separately,
starting with a mandatory dry run:

```bash
STRIPE_LEGACY_MAX_PRODUCT_IDS=prod_existing_blueprint \
  npx tsx scripts/billing/import-legacy-stripe.ts --mode=live
```

`--apply` also requires `ALLOW_STRIPE_IMPORT_WRITE=true` and aborts before any
write when a Blueprint account matches multiple Stripe customers, has multiple
active subscriptions, or contains a subscription with no Core/Max mapping.

## Weekly Calls and Google Calendar

Weekly Calls are stored in Supabase and managed at `/ultimate/admin/calls`.
Published calls appear at `/ultimate/live-calls` for Max students. Every call
gets a no-auth “Add to Google Calendar” link, even when server sync is not set
up.

For automatic Google event creation and Google Meet links, enable the Calendar
API for a Google Cloud service account, share the target calendar with that
account as an editor, and configure:

```text
GOOGLE_CALENDAR_ID=
GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL=
GOOGLE_CALENDAR_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_CREATE_MEET=true
```

For Google Workspace domain-wide delegation, also set
`GOOGLE_CALENDAR_IMPERSONATE_USER` to the calendar owner. Calendar failures do
not discard the Supabase call record; the admin UI surfaces the sync warning so
the Meet link can be supplied manually.

## Meta conversion tracking

Two Zaps send website events to Scott's existing Meta dataset:

- Registration: Catch Hook -> Facebook Conversions / Send Other Event / CompleteRegistration.
- Initial purchase: Catch Hook -> Facebook Conversions / Send Other Event / Purchase.

Production configuration:

```text
META_CONVERSIONS_ENABLED=true
ZAPIER_FREE_REGISTER_WEBHOOK_URL=<registration Catch Hook URL>
ZAPIER_PURCHASE_WEBHOOK_URL=<purchase Catch Hook URL>
CRON_SECRET=<random secret, at least 32 characters>
```

Only Vercel Production sends conversions. Preview and local runs never send to
these hooks. Apply the `meta_conversion_delivery` migration before enabling it.

Registration fires after a new account and its verification email are created,
including signups that did not visit `/free`. Logins, account claims, rejected
forms, and page views do not fire. An existing `free_signup_attribution.notified_at`
continues to suppress previously reported registrations during the rollout.

Purchase fires from a verified live Stripe `invoice.paid` webhook, only for a
positive, collected initial subscription invoice belonging to a tracked Blueprint
account. Renewals, plan changes, test accounts, test-mode invoices, manual paid
invoices, and zero-dollar invoices are excluded. Value is actual USD amount paid
after discounts, converted from cents. No customer or subscription migration is
needed.

The browser's landing attribution is preserved in an HttpOnly cookie. The
registration and authenticated checkout routes persist matching context for the
later Stripe webhook. `fbc` retains the click timestamp; `event_time` is the
conversion timestamp. The current site does not install a Meta browser pixel;
`fbp` is included only if an existing valid browser cookie is available.

Map `event_time`, `event_id`, `event_source_url`, `email`, `first_name`,
`last_name`, `external_id`, `client_ip_address`, `client_user_agent`, `fbc`, `fbp`,
`value`, and `content_name` from the hook into the corresponding Meta fields.
Set Action Source to Website and Currency to USD. Put `utm_medium` and
`conversion_kind` in Additional Data. Zapier hashes customer matching fields.
Never map the raw `fbclid` into Meta's `fbc` field. If a browser conversion pixel
is added later, it must share this exact event name and event ID.

`marketing_conversion_events` stores immutable event IDs and original payloads.
A leased queue retries failed requests through `/api/cron/marketing` every five
minutes. `accepted_by_zapier` means the Catch Hook accepted the request; it does
not prove Meta accepted the downstream action. Check Zap history for downstream
errors and Meta responses, and enable Zapier Autoreplay when available. Events
that remain unsent for six days expire for manual review. No payload or hook
credential is written to application logs.

## Explanation editors

Admins manage scoped explanation access at `/ultimate/admin/staff`.
Explanation editors work at `/manager`; they can update only student-facing
explanations. Correct answers, prompts, publication controls, billing, and the
admin panel remain inaccessible. Every saved explanation is recorded in
`explanation_edit_log`.

Existing students can continue signing in through `/login`. Once password auth
is enabled, an already signed-in legacy student can visit `/account/claim` to
create a password without losing any email-owned progress.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
