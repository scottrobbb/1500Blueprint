alter table public.student_subscriptions
  add column if not exists pending_billing_cadence text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_subscriptions_pending_billing_cadence_check'
  ) then
    alter table public.student_subscriptions
      add constraint student_subscriptions_pending_billing_cadence_check
      check (pending_billing_cadence is null or pending_billing_cadence in ('monthly', 'three_month'));
  end if;
end $$;

comment on column public.student_subscriptions.pending_billing_cadence is
  'Billing cadence that a Stripe subscription schedule will apply at pending_change_effective_at.';
