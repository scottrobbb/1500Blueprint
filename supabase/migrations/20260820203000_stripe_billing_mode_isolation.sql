-- Keep Stripe sandbox and live customer identities separate. Preview purchases
-- must never grant access through a production customer record.

alter table public.users add column if not exists stripe_test_customer_id text;
alter table public.users add column if not exists stripe_live_customer_id text;

create unique index if not exists users_stripe_test_customer_id_idx
  on public.users(stripe_test_customer_id)
  where stripe_test_customer_id is not null;

create unique index if not exists users_stripe_live_customer_id_idx
  on public.users(stripe_live_customer_id)
  where stripe_live_customer_id is not null;
