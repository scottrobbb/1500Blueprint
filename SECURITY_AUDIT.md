# Security launch audit

Last reviewed: 2026-08-28

This checklist replaces the vague “anti-scraper” and “defense against malicious competitors” items with concrete controls that can be tested and operated. The application currently calls its plans Free, Core, and Max; “Ultimate” is the workspace name. Product copy should use one canonical tier vocabulary rather than treating Blueprint/Ultimate as another entitlement tier.

## Completed in this change set

- [x] Make tests, questions, answers, explanations, drills, walkthroughs, and course assets inaccessible through the browser-visible Supabase key.
- [x] Require server-side session, publication, ownership, and current-plan checks before protected content is loaded.
- [x] Reject suspended or archived accounts and inactive staff assignments at the authoritative server boundary.
- [x] Prevent canceled tracked subscriptions from falling back to stale legacy paid access.
- [x] Remove shared-key instant admin sessions; admins now prove mailbox possession with an expiring, single-use link.
- [x] Require at least 32 bytes of session-secret material and retain secure, HTTP-only, same-site cookies.
- [x] Add distributed, atomic, hashed rate limits for auth, AI grading, billing, uploads, community writes, test/test-drill autosaves, progress, settings, and other write-amplification routes. Rate-limit storage fails closed.
- [x] Bound streamed request bodies and persisted inputs; cap AI submissions; validate uploaded raster signatures; reject public SVG uploads.
- [x] Make Stripe webhooks size-bounded, mode-checked, PII-minimized, leased, retryable, and concurrency-safe.
- [x] Add checkout idempotency and validate Checkout/account/customer/subscription ownership before activation.
- [x] Require idempotency tokens for practice-test and module completion and validate answer payloads against the served test.
- [x] Make practice-test persistence, XP, streak, and achievement updates one idempotent database transaction.
- [x] Reserve one durable Checkout intent per account and Stripe mode before calling Stripe; recover expired creation leases on the same Stripe key.
- [x] Exercise Checkout, confirmation, webhook lease, and billing-portal route orchestration with dependency-injected Stripe/database failures and identity/idempotency cases.
- [x] Exercise upgrade/downgrade and refund implementations with injected ownership/mode mismatches, retry keys, refund windows/amounts, provider failures, and partial-state ordering.
- [x] Add aggregate database-integrity checks for account, auth identity, customer, subscription, and webhook inconsistencies.
- [x] Verify the configured hosted data without emitting identifiers: 236 accounts have zero normalized-email duplicates/noncanonical addresses, all 14 linked auth identities exist and match, and all four subscriptions have valid owners, customers, modes, plans, and statuses. Add a fail-closed canonical-email migration and post-deploy verifier.
- [x] Add PII-safe structured server error metadata plus Next.js unhandled-request instrumentation.
- [x] Remove raw server error logging and direct unbounded JSON parsing; regression tests inventory every route boundary.
- [x] Cap each Question Bank runner delivery at 30 questions, prioritize unseen questions across later sessions, disable automatic practice-page prefetching, and apply hashed per-account burst/daily read-anomaly limits to Question Bank sessions, practice tests, drills, and course lessons.
- [x] Explicitly revoke browser-role table/column access and default function execution across the complete Supabase surface; add an executable post-deploy RLS/storage verifier.
- [x] Constrain Storage bucket visibility, MIME types, sizes, and write policies; add a bounded, dry-run-first orphaned user-upload cleanup tool.
- [x] Add clickjacking, MIME-sniffing, referrer, permissions, HSTS, and minimal CSP response headers; remove the framework signature header.
- [x] Patch Next.js and transitive dependencies; the local dependency audit reports zero known vulnerabilities.
- [x] Add pull-request tests, lint, build, dependency-audit and CodeQL automation, reviewed install-script execution, and weekly dependency update checks.
- [x] Scan the tracked tree and Git history for common credential signatures. No apparent live credential was found; the private-key text in the README is a placeholder. Environment files remain ignored.
- [x] Add architecture-specific incident and credential-compromise runbooks plus an offline verifier that rejects incomplete or checksum-damaged database-and-Storage backup bundles.
- [x] Reconcile the hardening onto the current `origin/main` product revision, preserve the redesigned pricing surface, and carry the Max three-month offer through the same-origin, rate-limited, durable-idempotency Checkout path. The integrated suite passes 262 tests, TypeScript, lint, dependency audit, and production build.

## Deployment blockers

- [x] **Hosted Supabase P0 remediated on 2026-08-28.** Before migration, a read-only anonymous-key probe could enumerate paid test, module, question, choice, drill, and walkthrough content, and `course-assets` was public. After all eight pending migrations were applied, `npm run security:verify:remote` passed all 22 table, RPC, billing-integrity, and Storage checks with zero failures.
- [x] Apply the complete migration sequence through `20260828020000_canonical_account_emails.sql`, including the previously pending `20260827020000_staff_question_content_edit.sql` migration. Hosted and local migration history now match.
- [x] Verify anonymous paid-content denial, service-only RPC enforcement, billing-integrity health, canonical account identities, and both Storage bucket invariants through the hosted verifier.
- [ ] Smoke-test Free, Core, and Max accounts; suspended and canceled accounts; admin and explanation-editor accounts; signed course assets; test save/resume; Stripe checkout, upgrade, downgrade, cancellation, refund, and webhook retry in staging.
- [ ] Send structured logs to an alerting backend and alert on auth-rate-limit failures, AI provider failures/cost spikes, Stripe signature/mode/processing failures, expired webhook leases, and database error rates.
- [ ] Rotate production secrets with cryptographically generated values and remove the now-unused `ADMIN_ACCESS_KEY`. The GitHub API currently reports Dependabot alerts as disabled. An owner must enable Dependabot alerts/security updates and repository push protection under **Settings → Code security and analysis**, then review and close every open alert. GitHub secret scanning runs automatically for this public repository, but the current collaborator has write rather than admin permission and cannot inspect its private alert/settings view; an owner must confirm push protection and alert triage directly.
- [ ] Decide whether the public GitHub repository is intentional. It exposes the application source, business rules, and AI grading/generation prompts (including `supabase/drills_seed.sql`) to competitors and retains them in history. If these are proprietary, an owner must make the repository private, review collaborators/forks, rotate any historically exposed credentials, and plan history cleanup; the current token does not have repository-admin permission.
- [ ] Publish the local `.github` workflows and Dependabot configuration, let `verify` and CodeQL run successfully once, then have a repository owner create an active `main` ruleset requiring pull requests, one non-author approval, conversation resolution, and the `verify`/CodeQL checks; disallow force pushes, deletions, and bypass. The public GitHub APIs currently report `main` as `protected: false`, no repository rulesets, no remote workflows, and no remote `.github` directory.
- [ ] Configure CDN/WAF volumetric limits, managed OWASP/bot rules, and origin shielding. Vercel provides baseline platform-wide DDoS mitigation, but project-level WAF rules, Deployment Protection for previews, log drains, firewall-alert subscriptions, and team security settings could not be verified: the saved CLI session is expired and its read-only API requests return 403. A Vercel project owner must re-authenticate and review **Firewall**, **Settings → Deployment Protection**, **Observability/Drains**, and team roles/2FA. Application/database quotas reduce abuse cost but cannot absorb a network-layer flood.

## Remaining hardening

- [ ] Audit historical practice-test attempts against XP events. Pre-migration partial awards cannot be repaired automatically because old XP rows do not carry an attempt identifier.
- [ ] Run the orphaned-upload cleanup in dry-run mode on production, review candidates, and schedule a bounded recurring cleanup only after validation.
- [ ] Assign named incident/provider owners, enable the documented backup retention, create the first encrypted off-site database-and-Storage bundle, and complete the first disposable-project restore drill. The procedure and verifier now live in `docs/runbooks/backup-and-restore.md`.
- [ ] Evaluate per-account/session watermarking and device/session anomaly controls for high-value material. Current delivery limits slow and surface automated traversal, but an authorized user can still copy content that must reach their browser; detection, attribution, short-lived delivery, and enforceable terms are the realistic controls.
- [ ] Restrict Vimeo, Drive, and other external course resources at the provider. The application cannot revoke an external public URL after delivery.
