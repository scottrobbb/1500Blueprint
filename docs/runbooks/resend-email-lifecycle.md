# Resend email lifecycle

Supabase is the source of truth for student eligibility. Resend stores the matching Contacts, Segment membership, live-call Topic preference, scheduled Broadcasts, and provider delivery events.

## Required environment variables

- `RESEND_API_KEY`: send-only key for authentication and welcome email.
- `RESEND_MANAGEMENT_API_KEY`: full-access key for Contacts, Segments, Topics, Broadcasts, and Webhooks.
- `RESEND_STUDENT_SEGMENT_ID`: Resend Segment containing active non-test students.
- `RESEND_LIVE_CALL_TOPIC_ID`: public Topic used for live-call reminder preferences.
- `RESEND_WEBHOOK_SECRET`: signing secret for `https://www.1500satblueprint.com/api/email/webhook`.
- `CRON_SECRET`: random secret of at least 16 characters used by Vercel for `/api/cron/email`.
- `EMAIL_FROM`: verified sender on `1500satblueprint.com`.
- `EMAIL_REPLY_TO`: monitored reply address.
- `EMAIL_PHYSICAL_ADDRESS`: business mailing address shown in Broadcast footers.

## Release order

1. Apply `supabase/migrations/20260829153512_resend_email_lifecycle.sql`.
2. Add `RESEND_MANAGEMENT_API_KEY` locally and run `npm run email:setup` without `--apply`. It only reports what would be created.
3. Run `npm run email:setup -- --apply` once. Save the returned Segment ID, Topic ID, webhook secret, and cron secret in Vercel.
4. Add `EMAIL_REPLY_TO` and `EMAIL_PHYSICAL_ADDRESS` in Vercel.
5. Deploy the application. Vercel registers the daily recovery cron from `vercel.json` only on production deployments.
6. Run the cron route once with `Authorization: Bearer $CRON_SECRET`, then confirm the Contact import and webhook in Resend.
7. Create a draft call, publish it, and confirm that the admin UI reports the reminder schedule. Use a Resend-owned test recipient before publishing to the full student Segment.

## Runtime behavior

- Successful account confirmation queues a Resend Contact sync and sends one idempotent welcome email.
- Existing password and legacy logins repair missing Contact membership without re-subscribing a person who opted out.
- Publishing a future call creates a durable Supabase campaign and schedules one Resend Broadcast for 24 hours before the call. Calls published less than 24 hours ahead schedule two minutes after publication.
- Editing a scheduled call replaces the unsent Broadcast. Drafting, cancelling, or deleting the call cancels the unsent Broadcast.
- The Broadcast includes a Topic-scoped Resend unsubscribe link.
- Verified webhooks update per-recipient delivery state and suppress future direct sends after a hard bounce, complaint, or provider suppression.
- Open and click events are stored when tracking is enabled in Resend. Keep tracking disabled for sensitive authentication links unless product requirements explicitly outweigh the deliverability and security trade-off.
- The daily cron repairs failed Contact imports, missing campaigns, and transient scheduling failures. The request-time `after()` path remains the primary low-latency trigger.

## Monitoring queries

```sql
select status, count(*) from public.email_campaigns group by status order by status;
select sync_status, delivery_status, count(*) from public.email_contacts group by sync_status, delivery_status;
select status, count(*) from public.email_messages group by status order by status;
select event_type, count(*) from public.email_webhook_events group by event_type order by event_type;
```

Never paste student email rows, Resend API keys, webhook secrets, or raw webhook bodies into logs or support tickets.
