alter table public.users add column if not exists stripe_customer_id text;

create unique index if not exists users_stripe_customer_id_idx
  on public.users(stripe_customer_id)
  where stripe_customer_id is not null;

alter table public.student_subscriptions add column if not exists livemode boolean not null default false;
alter table public.student_subscriptions add column if not exists stripe_created_at timestamptz;
alter table public.student_subscriptions add column if not exists refundable_until timestamptz;

comment on column public.student_subscriptions.refundable_until is
  'The end of the 24-hour refund-request window for the first subscription purchase.';
