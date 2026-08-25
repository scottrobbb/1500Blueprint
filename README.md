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
- Additional private reviewers can be added with the comma-separated `ULTIMATE_PREVIEW_EMAILS` environment variable.
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

Keep `PASSWORD_SIGNUP_ENABLED` off during the migration period. Password login
can be enabled independently for existing students without opening Free signup.

Both flows are available by default during local development and can be forced
off there by setting either flag to `false`.

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
