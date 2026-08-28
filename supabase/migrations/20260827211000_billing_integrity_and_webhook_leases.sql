-- Make webhook retries lease-based and keep the event ledger free of customer
-- payloads. Stripe retains the canonical event; this table only needs enough
-- metadata to reconcile processing and investigate failures.

alter table public.billing_webhook_events
  add column if not exists processing_started_at timestamptz;

update public.billing_webhook_events
set processing_started_at = coalesce(processed_at, received_at, now())
where processing_started_at is null;

alter table public.billing_webhook_events
  alter column processing_started_at set default now(),
  alter column processing_started_at set not null;

update public.billing_webhook_events
set payload = jsonb_strip_nulls(jsonb_build_object(
  'object_id', case
    when length(payload #>> '{data,object,id}') between 1 and 128
      then payload #>> '{data,object,id}'
    when length(payload ->> 'object_id') between 1 and 128
      then payload ->> 'object_id'
    else null
  end,
  'object_type', case
    when length(payload #>> '{data,object,object}') between 1 and 64
      then payload #>> '{data,object,object}'
    when length(payload ->> 'object_type') between 1 and 64
      then payload ->> 'object_type'
    else null
  end
));

comment on column public.billing_webhook_events.payload is
  'PII-minimized Stripe object type/id metadata; never store the raw webhook payload.';
comment on column public.billing_webhook_events.processing_started_at is
  'Start of the current processing lease. A delivery may reclaim an expired lease.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_webhook_events_attempts_positive_check'
  ) then
    alter table public.billing_webhook_events
      add constraint billing_webhook_events_attempts_positive_check
      check (attempts > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_webhook_events_processed_state_check'
  ) then
    alter table public.billing_webhook_events
      add constraint billing_webhook_events_processed_state_check
      check ((processing_status = 'processed') = (processed_at is not null)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_subscriptions_billable_plan_check'
  ) then
    alter table public.student_subscriptions
      add constraint student_subscriptions_billable_plan_check
      check (plan_code in ('core', 'max')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_subscriptions_stripe_status_check'
  ) then
    alter table public.student_subscriptions
      add constraint student_subscriptions_stripe_status_check
      check (status in (
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused'
      )) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_subscriptions_period_order_check'
  ) then
    alter table public.student_subscriptions
      add constraint student_subscriptions_period_order_check
      check (
        current_period_start is null
        or current_period_end is null
        or current_period_end >= current_period_start
      ) not valid;
  end if;
end
$$;

-- Aggregate-only operational audit. It exposes no emails, user ids, or Stripe
-- ids and remains service-role-only like the underlying billing tables.
create or replace function public.get_billing_integrity_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'duplicateNormalizedEmailGroups', (
      select count(*) from (
        select lower(trim(email))
        from public.users
        group by lower(trim(email))
        having count(*) > 1
      ) duplicates
    ),
    'authIdentityEmailMismatches', (
      select count(*)
      from public.users blueprint_user
      join auth.users auth_user on auth_user.id = blueprint_user.auth_user_id
      where lower(trim(auth_user.email)) is distinct from lower(trim(blueprint_user.email))
    ),
    'subscriptionCustomerMismatches', (
      select count(*)
      from public.student_subscriptions subscription
      join public.users blueprint_user on blueprint_user.id = subscription.user_id
      where subscription.stripe_customer_id is distinct from case
        when subscription.livemode then blueprint_user.stripe_live_customer_id
        else blueprint_user.stripe_test_customer_id
      end
    ),
    'duplicateActiveSubscriptionGroups', (
      select count(*) from (
        select user_id, livemode
        from public.student_subscriptions
        where status in ('active', 'trialing', 'past_due')
        group by user_id, livemode
        having count(*) > 1
      ) duplicates
    ),
    'invalidSubscriptionPlans', (
      select count(*)
      from public.student_subscriptions
      where plan_code not in ('core', 'max')
    ),
    'invalidSubscriptionStatuses', (
      select count(*)
      from public.student_subscriptions
      where status not in (
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused'
      )
    ),
    'failedWebhookEvents', (
      select count(*)
      from public.billing_webhook_events
      where processing_status = 'failed'
    ),
    'expiredWebhookLeases', (
      select count(*)
      from public.billing_webhook_events
      where processing_status = 'processing'
        and processing_started_at <= now() - interval '5 minutes'
    )
  );
$$;

revoke all on function public.get_billing_integrity_health() from public, anon, authenticated;
grant execute on function public.get_billing_integrity_health() to service_role;

comment on function public.get_billing_integrity_health() is
  'Aggregate account, subscription, and webhook integrity counts for operational monitoring.';
