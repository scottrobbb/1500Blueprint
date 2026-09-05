-- Conversion delivery is server-only. Acceptance by Zapier is distinct from Meta receipt.
create table public.marketing_attribution (
  email text primary key,
  context jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.marketing_conversion_events (
  event_id text primary key,
  email text not null,
  event_name text not null check (event_name in ('CompleteRegistration', 'Purchase')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','accepted_by_zapier','expired')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  accepted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index marketing_conversion_delivery_due on public.marketing_conversion_events(next_attempt_at)
  where status in ('pending','sending');
alter table public.marketing_attribution enable row level security;
alter table public.marketing_conversion_events enable row level security;
revoke all on public.marketing_attribution, public.marketing_conversion_events from public, anon, authenticated;
grant select, insert, update, delete on public.marketing_attribution, public.marketing_conversion_events to service_role;

create function public.save_marketing_attribution(p_email text, p_context jsonb)
returns void language sql security invoker set search_path = public as $$
  insert into marketing_attribution as existing(email, context)
  values (lower(btrim(p_email)), jsonb_strip_nulls(p_context))
  on conflict (email) do update
    set context = existing.context || jsonb_strip_nulls(excluded.context), updated_at = now();
$$;
revoke all on function public.save_marketing_attribution(text,jsonb) from public, anon, authenticated;
grant execute on function public.save_marketing_attribution(text,jsonb) to service_role;

create function public.claim_marketing_conversions(p_event_id text default null, p_limit integer default 10)
returns setof public.marketing_conversion_events
language sql security invoker set search_path = public as $$
  with due as (
    select event_id from marketing_conversion_events
    where (p_event_id is null or event_id = p_event_id)
      and next_attempt_at <= now()
      and (status = 'pending' or (status = 'sending' and lease_expires_at < now()))
    order by next_attempt_at
    limit greatest(1, least(p_limit, 10))
    for update skip locked
  )
  update marketing_conversion_events as event
  set status = 'sending', attempts = attempts + 1, lease_expires_at = now() + interval '2 minutes'
  from due where event.event_id = due.event_id returning event.*;
$$;
revoke all on function public.claim_marketing_conversions(text,integer) from public, anon, authenticated;
grant execute on function public.claim_marketing_conversions(text,integer) to service_role;
