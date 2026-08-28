# Supabase backup verification and restore drill

This application has two separate backup surfaces:

- Supabase Postgres contains Auth identities, student records, entitlements, test state, billing reconciliation, RPCs, RLS, and Storage metadata.
- Supabase Storage contains the actual bytes in private `course-assets` and public `figures`. Database backups do **not** contain those bytes.

Stripe remains authoritative for customers, subscriptions, invoices, refunds, and events. Never restore Stripe from a database snapshot; reconcile Supabase back to Stripe after a database recovery.

## Recovery standard

- Enable Supabase daily physical backups. Enable PITR if losing up to one day of account, progress, or billing state is unacceptable.
- Create an encrypted logical database-plus-Storage bundle at least monthly and before a destructive migration.
- Keep one encrypted copy outside the Supabase organization and outside this Git repository.
- Run the drill below quarterly and after changing Auth, billing, RLS, or Storage architecture.
- Record bundle timestamp, Git revision, Supabase recovery point, object counts, test result, restore duration, and operator in the incident system. Never record credentials or customer identifiers.

Primary operator: **assign a Supabase project owner**. Reviewer: **assign a second person with Vercel and Stripe read access**.

## Create and verify a manual bundle

Use a trusted encrypted workstation. The database connection URL and generated S3 keys are secrets; do not paste them into tickets, shell history, or committed files.

```bash
umask 077
export RECOVERY_BUNDLE="/secure/1500blueprint/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RECOVERY_BUNDLE/storage/course-assets" "$RECOVERY_BUNDLE/storage/figures"
read -rs SOURCE_DATABASE_URL
export SOURCE_DATABASE_URL
npx supabase db dump --db-url "$SOURCE_DATABASE_URL" -f "$RECOVERY_BUNDLE/roles.sql" --role-only
npx supabase db dump --db-url "$SOURCE_DATABASE_URL" -f "$RECOVERY_BUNDLE/schema.sql"
npx supabase db dump --db-url "$SOURCE_DATABASE_URL" -f "$RECOVERY_BUNDLE/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
unset SOURCE_DATABASE_URL
```

In Supabase **Storage → Configuration → S3**, create a short-lived server-side S3 key. Configure it without putting the secret in a command argument:

```bash
export RCLONE_CONFIG_BPBACKUP_TYPE=s3
export RCLONE_CONFIG_BPBACKUP_PROVIDER=Other
read -r RCLONE_CONFIG_BPBACKUP_ENDPOINT
read -r RCLONE_CONFIG_BPBACKUP_REGION
read -r RCLONE_CONFIG_BPBACKUP_ACCESS_KEY_ID
read -rs RCLONE_CONFIG_BPBACKUP_SECRET_ACCESS_KEY
export RCLONE_CONFIG_BPBACKUP_ENDPOINT RCLONE_CONFIG_BPBACKUP_REGION
export RCLONE_CONFIG_BPBACKUP_ACCESS_KEY_ID RCLONE_CONFIG_BPBACKUP_SECRET_ACCESS_KEY
rclone copy bpbackup:course-assets "$RECOVERY_BUNDLE/storage/course-assets" --checksum --checkers 8 --transfers 4
rclone copy bpbackup:figures "$RECOVERY_BUNDLE/storage/figures" --checksum --checkers 8 --transfers 4
rclone check bpbackup:course-assets "$RECOVERY_BUNDLE/storage/course-assets" --download
rclone check bpbackup:figures "$RECOVERY_BUNDLE/storage/figures" --download
unset RCLONE_CONFIG_BPBACKUP_ACCESS_KEY_ID RCLONE_CONFIG_BPBACKUP_SECRET_ACCESS_KEY
```

Revoke the temporary S3 key immediately. Then create a tamper-evident inventory and run the repository verifier:

```bash
(
  cd "$RECOVERY_BUNDLE"
  find roles.sql schema.sql data.sql storage -type f -exec shasum -a 256 {} \; > SHA256SUMS
)
npm run security:verify:backup -- --directory="$RECOVERY_BUNDLE"
```

The verifier fails if checksums differ, either Storage bucket has no bytes, or critical account, billing, test, drill, and course relations are absent. Encrypt the complete directory with the organization-approved backup key before copying it off the workstation, then securely remove the plaintext copy according to the workstation policy.

## Quarterly restore drill

Never drill against production. Use Supabase **Database → Backups → Restore to a New Project** from the selected production recovery point. This is preferred over a logical import because it preserves Auth users and the encryption root key. Name the project `1500blueprint-recovery-YYYYMMDD`, keep it network-restricted, and do not attach a production domain or production Stripe key.

1. Record the selected recovery point and start time.
2. Restore to the disposable project. Confirm it has a different project reference and URL before continuing.
3. Recreate only the Auth redirect settings needed for the disposable hostname. Do not enable public password signup.
4. Recreate `course-assets` as private and `figures` as public with the size/MIME constraints in `20260828010000_complete_rls_and_storage_hardening.sql`.
5. Copy the saved Storage bytes to the disposable project with a distinct `bprestore:` rclone remote, then run `rclone check` in both directions. Never point `bprestore:` at production.
6. Use the disposable database-owner URL to run:

```bash
psql "$DRILL_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/account_integrity_verification.sql
psql "$DRILL_DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/rls_storage_verification.sql
NEXT_PUBLIC_SUPABASE_URL="$DRILL_SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$DRILL_PUBLISHABLE_KEY" \
SUPABASE_SECRET_KEY="$DRILL_SECRET_KEY" \
npm run security:verify:remote
```

7. Deploy the current Git revision only to a protected Vercel preview with disposable Supabase credentials and Stripe **test-mode** credentials.
8. Smoke-test: legacy and password login; suspended-user denial; Free/Core/Max boundaries; signed `course-assets`; figure rendering; test save/resume/submission; admin/staff denial and access; test-mode checkout; and duplicate webhook delivery.
9. Compare aggregate counts for `users`, `student_subscriptions`, tests/questions, courses/lessons, test attempts, and both Storage buckets with the source recovery point. Do not export row bodies into the drill record.
10. Record achieved RPO/RTO, every failed check, and corrective owner. Delete the disposable Vercel deployment and Supabase project only after the reviewer confirms the evidence has been retained.

## Real recovery cautions

- An in-place Supabase restore causes downtime. Freeze application writes first and preserve the exact incident timestamp.
- Restoring Postgres backwards can make `student_subscriptions` and `billing_webhook_events` older than Stripe. Keep the Stripe webhook endpoint available where safe, replay missed Stripe events, and run `get_billing_integrity_health()` before reopening checkout.
- Old Vercel deployments retain old environment values. A recovered project requires a fresh deployment and retirement/protection of older deployment URLs.
- A physical clone does not copy Storage bytes, Auth settings/API keys, Edge Functions, or project settings; restore and verify them separately.

References: [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [restore to a new project](https://supabase.com/docs/guides/platform/clone-project), [CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [Storage S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication).
