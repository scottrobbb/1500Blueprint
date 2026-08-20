-- Additive account and billing foundation for the password-auth rollout.
-- Existing magic-link users and every email-owned content row remain intact.

alter table public.users add column if not exists auth_user_id uuid;
alter table public.users add column if not exists name text;
alter table public.users add column if not exists account_status text not null default 'active';
alter table public.users add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_auth_user_id_fkey'
  ) then
    alter table public.users
      add constraint users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_account_status_check'
  ) then
    alter table public.users
      add constraint users_account_status_check
      check (account_status in ('active', 'suspended', 'archived'));
  end if;
end
$$;

create unique index if not exists users_auth_user_id_idx
  on public.users(auth_user_id)
  where auth_user_id is not null;

-- Called only by the service-role client after Supabase has verified the user.
-- A verified email may claim an existing legacy row, which preserves all of the
-- student's email-owned progress without copying or rewriting it.
create or replace function public.record_password_login(
  p_auth_user_id uuid,
  p_email text,
  p_display_name text default null,
  p_allow_create boolean default false
)
returns table (
  id text,
  email text,
  plan text,
  auth_user_id uuid,
  account_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
  verified_auth_email text;
  auth_email_confirmed_at timestamptz;
  existing_auth_user_id uuid;
  existing_email text;
  existing_user_id text;
begin
  if p_auth_user_id is null or normalized_email = '' then
    raise exception 'A verified auth user and email are required';
  end if;

  select lower(trim(au.email)), au.email_confirmed_at
    into verified_auth_email, auth_email_confirmed_at
    from auth.users au
   where au.id = p_auth_user_id;

  if verified_auth_email is null
    or auth_email_confirmed_at is null
    or verified_auth_email <> normalized_email then
    raise exception 'The auth identity does not own this verified email';
  end if;

  select u.email
    into existing_email
    from public.users u
   where u.auth_user_id = p_auth_user_id
   for update;

  if existing_email is not null and existing_email <> normalized_email then
    raise exception 'This auth identity is already linked to another account';
  end if;

  select u.id, u.auth_user_id
    into existing_user_id, existing_auth_user_id
    from public.users u
   where u.email = normalized_email
   for update;

  if existing_auth_user_id is not null and existing_auth_user_id <> p_auth_user_id then
    raise exception 'This email is already linked to another auth identity';
  end if;

  if existing_user_id is null and not p_allow_create then
    raise exception 'No existing student account can be linked to this identity';
  end if;

  insert into public.users as account (
    email,
    plan,
    auth_user_id,
    name,
    login_count,
    last_login_at,
    updated_at
  )
  values (
    normalized_email,
    'free',
    p_auth_user_id,
    nullif(trim(p_display_name), ''),
    1,
    now(),
    now()
  )
  on conflict (email) do update
    set auth_user_id = p_auth_user_id,
        name = coalesce(nullif(trim(p_display_name), ''), account.name),
        login_count = account.login_count + 1,
        last_login_at = now(),
        updated_at = now()
  returning
    account.id,
    account.email,
    account.plan,
    account.auth_user_id,
    account.account_status
  into id, email, plan, auth_user_id, account_status;

  return next;
end;
$$;

revoke all on function public.record_password_login(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_password_login(uuid, text, text, boolean) to service_role;

create table if not exists public.plan_definitions (
  code text primary key,
  name text not null,
  rank smallint not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code in ('free', 'core', 'max'))
);

create table if not exists public.plan_entitlements (
  plan_code text not null references public.plan_definitions(code) on delete cascade,
  entitlement_key text not null,
  entitlement_value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, entitlement_key)
);

create table if not exists public.student_subscriptions (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references public.users(id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  plan_code text not null references public.plan_definitions(code),
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_product_id text,
  stripe_price_id text,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists student_subscriptions_active_user_idx
  on public.student_subscriptions(user_id)
  where status in ('active', 'trialing', 'past_due');
create index if not exists student_subscriptions_customer_idx
  on public.student_subscriptions(stripe_customer_id);

create table if not exists public.access_grants (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references public.users(id) on delete cascade,
  plan_code text not null references public.plan_definitions(code),
  source text not null check (source in ('admin', 'legacy', 'promotion')),
  reason text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  granted_by text,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create index if not exists access_grants_active_user_idx
  on public.access_grants(user_id, starts_at, expires_at)
  where revoked_at is null;

create table if not exists public.billing_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

insert into public.plan_definitions (code, name, rank)
values
  ('free', 'Free', 0),
  ('core', 'Core', 1),
  ('max', 'Max', 2)
on conflict (code) do update
  set name = excluded.name,
      rank = excluded.rank,
      updated_at = now();

insert into public.plan_entitlements (plan_code, entitlement_key, entitlement_value)
values
  ('free', 'question_bank_limit', '300'::jsonb),
  ('free', 'full_test_limit', '1'::jsonb),
  ('free', 'course_desmos_101', 'true'::jsonb),
  ('free', 'course_rw_101', 'true'::jsonb),
  ('free', 'challenge_questions', 'false'::jsonb),
  ('free', 'all_courses', 'false'::jsonb),
  ('free', 'live_group_classes', 'false'::jsonb),
  ('free', 'study_planner', 'false'::jsonb),
  ('free', 'discord_role', 'null'::jsonb),
  ('core', 'question_bank_limit', '3000'::jsonb),
  ('core', 'full_test_limit', '2'::jsonb),
  ('core', 'daily_drill_limit', '20'::jsonb),
  ('core', 'course_desmos_101', 'true'::jsonb),
  ('core', 'course_rw_101', 'true'::jsonb),
  ('core', 'challenge_questions', 'true'::jsonb),
  ('core', 'all_courses', 'false'::jsonb),
  ('core', 'live_group_classes', 'false'::jsonb),
  ('core', 'study_planner', 'false'::jsonb),
  ('core', 'discord_role', '"core"'::jsonb),
  ('max', 'question_bank_limit', '3000'::jsonb),
  ('max', 'full_test_limit', '10'::jsonb),
  ('max', 'daily_drill_limit', '"unlimited"'::jsonb),
  ('max', 'course_desmos_101', 'true'::jsonb),
  ('max', 'course_rw_101', 'true'::jsonb),
  ('max', 'challenge_questions', 'true'::jsonb),
  ('max', 'all_courses', 'true'::jsonb),
  ('max', 'live_group_classes', 'true'::jsonb),
  ('max', 'study_planner', 'true'::jsonb),
  ('max', 'discord_role', '"max"'::jsonb)
on conflict (plan_code, entitlement_key) do update
  set entitlement_value = excluded.entitlement_value,
      updated_at = now();

alter table public.plan_definitions enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.student_subscriptions enable row level security;
alter table public.access_grants enable row level security;
alter table public.billing_webhook_events enable row level security;

revoke all on table public.plan_definitions from public, anon, authenticated;
revoke all on table public.plan_entitlements from public, anon, authenticated;
revoke all on table public.student_subscriptions from public, anon, authenticated;
revoke all on table public.access_grants from public, anon, authenticated;
revoke all on table public.billing_webhook_events from public, anon, authenticated;

grant select, insert, update, delete on table public.plan_definitions to service_role;
grant select, insert, update, delete on table public.plan_entitlements to service_role;
grant select, insert, update, delete on table public.student_subscriptions to service_role;
grant select, insert, update, delete on table public.access_grants to service_role;
grant select, insert, update, delete on table public.billing_webhook_events to service_role;
