# Credential compromise

Treat a credential as compromised when it appears in source control, logs, a ticket/chat, an untrusted workstation, or unexplained provider activity. Do not wait for proof of use and do not paste the value into the incident record.

Incident commander: **assign an organization owner**. Provider operators: the Supabase, Vercel, and Stripe owners. A second person verifies every production rotation.

## First 15 minutes

1. Open an incident record with UTC discovery time, credential **name**, environment, likely exposure start, and discoverer. Store no secret values.
2. Preserve relevant Git commit IDs, Vercel deployment IDs/log time ranges, Supabase audit-log time ranges, and Stripe request/event IDs.
3. Identify every Vercel environment and old deployment that contains the credential. Environment changes affect only new deployments.
4. Create the replacement at the provider, update Production and Preview, redeploy, verify, and then revoke the old credential. For confirmed active abuse, revoke first and accept the outage.
5. Protect or retire old Vercel deployment URLs because they continue using the old value.

Enter a replacement through stdin rather than shell history:

```bash
read -rs NEW_SECRET
printf '%s' "$NEW_SECRET" | vercel env update VARIABLE_NAME production --sensitive
printf '%s' "$NEW_SECRET" | vercel env update VARIABLE_NAME preview --sensitive
unset NEW_SECRET
vercel redeploy PRODUCTION_DEPLOYMENT_URL
```

Run `npm run security:verify:remote`, an authenticated smoke test, and the provider-specific checks below before revocation when an overlap is safe.

## Rotation matrix

| Credential | Immediate action | Verification and investigation |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` or S3 key | Rotate/revoke in Supabase, update Vercel, redeploy. This key bypasses RLS, so treat exposure as possible full database/Storage access. | Run both SQL verification files and `security:verify:remote`; inspect Auth/admin changes, database audit logs, Storage object changes, and unexpected service-role traffic. |
| Database password/URL | Reset the database password, update every approved operator/automation, terminate unknown sessions, and redeploy any runtime that used it. | Review Postgres connections and changes; run account, billing, RLS, and Storage verification. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | It is intentionally browser-visible. Rotate only if the project/JWT trust boundary or key configuration is compromised—not merely because it appears in client code. | Confirm anonymous RLS denial with `security:verify:remote`. |
| `AUTH_SECRET` | Generate at least 32 bytes (`openssl rand -base64 48`), update Vercel, and redeploy. | All legacy session JWTs are invalidated; verify legacy login and password login separately. Supabase password sessions are not signed by this value. |
| `STRIPE_BILLING_KEY` / `STRIPE_RESTRICTED_KEY` | Rotate in Stripe. Use the shortest delayed expiry that permits a verified Vercel rollout, then expire the old key. Prefer a restricted replacement with only required resources. | Review Stripe request logs for unfamiliar IPs/actions, refunds, subscription changes, prices, and webhook endpoint changes. Reconcile `student_subscriptions`, `billing_refunds`, and `get_billing_integrity_health()`. Contact Stripe for unrecognized live activity. |
| `STRIPE_WEBHOOK_SECRET` | Roll the production endpoint signing secret. Stripe can overlap old/new secrets briefly; update Vercel and redeploy during that window, then expire the old secret. | Send a test event, confirm a successful `billing_webhook_events` lease/finish, and check for signature or mode errors. Do not block `/api/billing/webhook` while recovering checkout. |
| `ANTHROPIC_API_KEY` | Revoke/rotate at Anthropic and update Vercel. Temporarily firewall `/api/drills/grade` if abuse continues. | Review provider usage/cost by time and model; inspect rate-limit and grading-failure telemetry. |
| `RESEND_API_KEY` | Revoke/rotate at Resend and update Vercel. | Review sent-email/audit activity; verify member link, password verification, and reset emails without exposing tokens. |
| Google service-account private key | Disable/delete the exposed key in Google Cloud, create a replacement, update Vercel, and confirm the calendar share/impersonation scope. | Review service-account audit logs and unexpected Calendar/Drive changes; verify call creation and video-duration reads. |
| Vercel or GitHub access token | Revoke at the provider first, remove unknown sessions/keys, require MFA, and review team/repository membership. | Review deployments, environment-variable changes, domains, Git refs, workflow runs, releases, and audit logs. |

## Exposure in Git

Rotation is mandatory even if the commit is reverted. Preserve the commit hash, rotate first, then remove the value from the current tree and history if required. Review forks, clones, build logs, artifacts, and caches. History rewriting reduces rediscovery but cannot make a leaked credential safe.

## Closure

Close only after the replacement deployment is serving, old deployment URLs are protected, the old credential is revoked, provider logs are reviewed across the exposure window, billing/data integrity checks pass, and a root cause/corrective owner is recorded.

References: [Vercel secret rotation](https://vercel.com/docs/environment-variables/rotating-secrets), [Vercel environment CLI](https://vercel.com/docs/cli/env), [Stripe API-key rotation](https://docs.stripe.com/keys), and [Stripe webhook secret rolling](https://docs.stripe.com/webhooks).
