-- Sandbox and live subscriptions may coexist while billing is migrated.
-- Only one paid-state subscription is allowed per user in each Stripe mode.

drop index if exists public.student_subscriptions_active_user_idx;

create unique index student_subscriptions_active_user_mode_idx
  on public.student_subscriptions(user_id, livemode)
  where status in ('active', 'trialing', 'past_due');
