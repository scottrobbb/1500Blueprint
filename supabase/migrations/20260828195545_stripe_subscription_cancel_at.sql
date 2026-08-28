alter table public.student_subscriptions
  add column if not exists cancel_at timestamptz;

update public.student_subscriptions
set cancel_at = current_period_end
where cancel_at is null
  and cancel_at_period_end
  and current_period_end is not null;

comment on column public.student_subscriptions.cancel_at is
  'Exact Stripe cancellation timestamp. Unlike cancel_at_period_end, Customer Portal cancellations may set this directly.';
