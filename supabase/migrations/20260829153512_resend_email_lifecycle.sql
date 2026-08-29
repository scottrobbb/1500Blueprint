-- Durable Resend contact, campaign, message, and webhook tracking.
-- Supabase remains the source of truth for student eligibility; Resend is the
-- delivery and preference layer. Every table is service-role only.

create table if not exists public.email_contacts (
  email text primary key references public.users(email) on update cascade on delete cascade,
  user_id text not null unique references public.users(id) on delete cascade,
  resend_contact_id text unique,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'syncing', 'synced', 'removed', 'failed')),
  delivery_status text not null default 'active'
    check (delivery_status in ('active', 'hard_bounced', 'complained', 'suppressed')),
  broadcast_unsubscribed boolean not null default false,
  resend_import_id text,
  last_error_code text,
  last_synced_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_contacts_sync_idx
  on public.email_contacts(sync_status, updated_at);
create index if not exists email_contacts_import_idx
  on public.email_contacts(resend_import_id)
  where resend_import_id is not null;

create table if not exists public.email_contact_imports (
  id text primary key default gen_random_uuid()::text,
  resend_import_id text not null unique,
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'completed', 'failed')),
  total_count integer not null default 0 check (total_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaigns (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (kind in ('live_call_reminder')),
  call_id text not null references public.weekly_calls(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'scheduled', 'sent', 'cancelling', 'cancelled', 'failed')),
  version integer not null default 1 check (version > 0),
  resend_broadcast_id text unique,
  resend_broadcast_version integer check (resend_broadcast_version is null or resend_broadcast_version > 0),
  scheduled_for timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  processing_started_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, call_id)
);

create index if not exists email_campaigns_work_idx
  on public.email_campaigns(status, next_attempt_at, created_at);
create index if not exists email_campaigns_broadcast_idx
  on public.email_campaigns(resend_broadcast_id)
  where resend_broadcast_id is not null;

create table if not exists public.email_messages (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (
    kind in ('magic_link', 'signup_verification', 'password_reset', 'welcome', 'live_call_reminder')
  ),
  recipient_email text,
  campaign_id text references public.email_campaigns(id) on delete set null,
  resend_email_id text unique,
  resend_broadcast_id text,
  idempotency_key text unique,
  status text not null default 'queued' check (
    status in ('queued', 'scheduled', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'suppressed')
  ),
  last_error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  click_count integer not null default 0 check (click_count >= 0),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_messages_campaign_idx
  on public.email_messages(campaign_id, created_at desc);
create index if not exists email_messages_recipient_idx
  on public.email_messages(recipient_email, created_at desc);

create table if not exists public.email_webhook_events (
  resend_event_id text primary key,
  event_type text not null,
  resend_email_id text,
  resend_broadcast_id text,
  recipient_email text,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  processed_at timestamptz,
  processing_error text
);

create index if not exists email_webhook_events_email_idx
  on public.email_webhook_events(resend_email_id, event_created_at desc);
create index if not exists email_webhook_events_broadcast_idx
  on public.email_webhook_events(resend_broadcast_id, event_created_at desc);

alter table public.email_contacts enable row level security;
alter table public.email_contact_imports enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_webhook_events enable row level security;

revoke all on table
  public.email_contacts,
  public.email_contact_imports,
  public.email_campaigns,
  public.email_messages,
  public.email_webhook_events
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.email_contacts,
  public.email_contact_imports,
  public.email_campaigns,
  public.email_messages,
  public.email_webhook_events
to service_role;

-- Backfill every real active student. Test accounts are deliberately excluded
-- so QA addresses cannot damage sender reputation.
insert into public.email_contacts (email, user_id)
select email, id
from public.users
where account_status = 'active'
  and is_test_account = false
on conflict (email) do update
set user_id = excluded.user_id,
    updated_at = now();

-- Return whether password confirmation created the account so the application
-- sends a welcome email once while still resyncing existing contacts on login.
drop function if exists public.record_password_login(uuid, text, text, boolean);

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
  account_status text,
  is_new boolean
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

  is_new := existing_user_id is null;

  insert into public.users as account (
    email, plan, auth_user_id, name, login_count, last_login_at, updated_at
  ) values (
    normalized_email,
    'free',
    p_auth_user_id,
    nullif(trim(p_display_name), ''),
    1,
    now(),
    now()
  )
  on conflict on constraint users_email_key do update
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

revoke all on function public.record_password_login(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_password_login(uuid, text, text, boolean)
  to service_role;

comment on table public.email_contacts is
  'Supabase-backed synchronization state for student Contacts in the Resend student Segment.';
comment on table public.email_campaigns is
  'Durable lifecycle and idempotency state for scheduled Resend Broadcasts.';
comment on table public.email_messages is
  'Per-recipient delivery state for authentication, welcome, and broadcast email.';
comment on table public.email_webhook_events is
  'PII-minimized idempotency ledger for verified Resend webhook deliveries.';

notify pgrst, 'reload schema';
