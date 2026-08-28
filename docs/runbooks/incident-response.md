# Production incident response

This runbook covers unauthorized access, paid-content exposure, credential misuse, account takeover, billing corruption, destructive database/Storage changes, and AI-cost abuse.

Roles are functional so the response can start before named owners are assigned:

- Incident commander: owns severity, decisions, and closure.
- Operations lead: Vercel/Supabase containment and recovery.
- Billing lead: Stripe evidence and reconciliation.
- Communications lead: customer/legal notifications.
- Scribe: UTC timeline, evidence IDs, decisions, and handoffs—never secret values or unnecessary PII.

## Severity and declaration

- **SEV-1:** active secret/service-role abuse, cross-user or paid-content exposure, destructive production change, fraudulent live billing, or production unavailable with no safe workaround.
- **SEV-2:** contained single-account compromise, material AI/email abuse, persistent webhook failures, or degraded protected feature.
- **SEV-3:** suspicious event with no confirmed security or customer impact.

Declare SEV-1 immediately. Record discovery time, earliest known event, affected routes/providers, current Git revision, Vercel deployment ID, Supabase project reference, and Stripe mode. Do not wait for complete attribution.

## First response checklist

1. Preserve evidence before cleanup: Vercel request/error logs, Supabase database/Auth/Storage audit windows, Stripe request/event IDs, Git commits and workflow IDs, and provider security notices.
2. Bound the incident using UTC timestamps, affected accounts/resources, credential names, and live versus test Stripe mode. Avoid exporting full row bodies.
3. Stop the narrowest harmful path:
   - Disable public signup with `PASSWORD_SIGNUP_ENABLED=false` and redeploy.
   - Use Vercel Firewall to challenge/block an abusive source or temporarily block the specific AI/write route.
   - Keep `/api/billing/webhook` reachable unless webhook authenticity itself is compromised; blocking it loses timely Stripe reconciliation.
   - Suspend a confirmed compromised student account by setting `users.account_status='suspended'`; server session and entitlement checks then fail closed.
   - For a leaked credential, follow `credential-compromise.md`.
4. Do not roll back Supabase simply to undo Stripe state. Stripe is authoritative; preserve events and reconcile.
5. Set an update cadence: 15 minutes for SEV-1, 30 minutes for SEV-2, or on every material change.

## Evidence-safe health checks

Run local integrity first, then hosted aggregate checks. These commands do not need customer row output:

```bash
npm test
npm run build
npm run security:verify:remote
psql "$INCIDENT_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/account_integrity_verification.sql
psql "$INCIDENT_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/rls_storage_verification.sql
```

For billing, inspect aggregate output from `get_billing_integrity_health()` and Stripe’s event/request logs. Check failed or expired webhook leases, duplicate active subscriptions, customer ownership mismatch, unexpected refunds, and live/test-mode mismatch. Record counts and Stripe object/event IDs only in restricted evidence.

For paid-content exposure, test anonymous and ordinary authenticated denial for `tests`, `questions`, `choices`, drill content, course content, and `course-assets`; confirm signed asset URLs expire. Preserve the vulnerable request and response metadata without redistributing paid content.

## Recovery decisions

- Prefer a forward fix and fresh Vercel deployment when data is intact.
- For destructive database change, choose a recovery point immediately before the first unauthorized write, freeze writes, and follow `backup-and-restore.md`. An in-place restore causes downtime.
- After a database restore, replay/reconcile Stripe events from the recovery point forward before reopening checkout. Validate subscription ownership and webhook idempotency.
- Restore Storage bytes separately. Postgres backups contain Storage metadata only.
- Rotate affected credentials and protect old deployments before reopening traffic.

## Reopen criteria

The incident commander and a second reviewer must confirm:

- the exploit/credential is contained and regression-tested;
- active, suspended, Free, Core, Max, admin, and scoped-staff boundaries behave correctly;
- `security:verify:remote` and both SQL verification files pass;
- Stripe webhook delivery and billing integrity are healthy in the configured mode;
- `course-assets` is private and both Storage buckets match their size/MIME constraints;
- monitoring covers recurrence and the next responsible owner/update time is recorded.

## After-action work

Within two business days, document the UTC timeline, root cause, affected data and customers, detection gap, recovery point and duration, provider evidence locations, notification decision, and corrective actions with owners/dates. Convert the exact failure into an automated regression or hosted alert. If personal data may have been exposed, communications/legal determines notification obligations; engineers should not make that decision from incomplete logs.
