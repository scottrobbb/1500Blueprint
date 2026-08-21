-- Stripe lifecycle state used by webhook reconciliation, scheduled plan changes,
-- and the first-purchase refund policy.

alter table public.student_subscriptions
  add column if not exists last_stripe_event_created_at bigint,
  add column if not exists last_stripe_event_id text,
  add column if not exists pending_plan_code text,
  add column if not exists pending_change_effective_at timestamptz,
  add column if not exists stripe_schedule_id text,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists last_payment_event_created_at bigint,
  add column if not exists refunded_at timestamptz,
  add column if not exists stripe_refund_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_subscriptions_pending_plan_code_fkey'
  ) then
    alter table public.student_subscriptions
      add constraint student_subscriptions_pending_plan_code_fkey
      foreign key (pending_plan_code) references public.plan_definitions(code);
  end if;
end
$$;

create unique index if not exists student_subscriptions_schedule_idx
  on public.student_subscriptions(stripe_schedule_id)
  where stripe_schedule_id is not null;

create unique index if not exists student_subscriptions_refund_idx
  on public.student_subscriptions(stripe_refund_id)
  where stripe_refund_id is not null;

alter table public.billing_webhook_events
  add column if not exists processing_status text not null default 'processed',
  add column if not exists attempts integer not null default 1,
  add column if not exists processing_error text,
  add column if not exists received_at timestamptz not null default now();

alter table public.billing_webhook_events
  alter column processed_at drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_webhook_events_processing_status_check'
  ) then
    alter table public.billing_webhook_events
      add constraint billing_webhook_events_processing_status_check
      check (processing_status in ('processing', 'processed', 'failed'));
  end if;
end
$$;

create table if not exists public.billing_refunds (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references public.users(id) on delete cascade,
  student_subscription_id text not null references public.student_subscriptions(id) on delete cascade,
  stripe_subscription_id text not null,
  stripe_refund_ids jsonb not null default '[]'::jsonb,
  stripe_payment_intent_ids jsonb not null default '[]'::jsonb,
  stripe_charge_ids jsonb not null default '[]'::jsonb,
  amount integer,
  currency text,
  status text not null default 'processing',
  reason text not null default 'requested_by_customer',
  requested_by text not null,
  livemode boolean not null,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_subscription_id)
);

create index if not exists billing_refunds_user_idx
  on public.billing_refunds(user_id, livemode, created_at);

alter table public.billing_refunds enable row level security;
revoke all on table public.billing_refunds from public, anon, authenticated;
grant select, insert, update, delete on table public.billing_refunds to service_role;

comment on table public.billing_refunds is
  'Admin-initiated Stripe refunds. One row per subscription makes the operation idempotent.';
