-- Meta conversion attribution for registrations that begin on the /free
-- landing page.
--
-- The ad parameters are captured in a cookie on /free, but a registration only
-- completes when the verification email is opened, routinely on a different
-- device where that cookie does not exist. The row is written when the signup
-- form succeeds and read back when the account is confirmed.
--
-- notified_at is the duplicate guard. The outbound webhook claims a row with a
-- single conditional update, so a replayed confirmation cannot send twice, and
-- one email address produces at most one conversion event.

create table if not exists public.free_signup_attribution (
  email       text primary key,
  fbclid      text,
  utm_medium  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  notified_at timestamptz,
  constraint free_signup_attribution_email_normalized_check check (
    email = lower(btrim(email)) and length(email) between 3 and 254
  ),
  constraint free_signup_attribution_fbclid_length_check check (
    fbclid is null or length(fbclid) between 1 and 255
  ),
  constraint free_signup_attribution_utm_medium_length_check check (
    utm_medium is null or length(utm_medium) between 1 and 64
  )
);

-- Supports the "registered but never confirmed" reconciliation read; the
-- notify path itself is a primary key lookup.
create index if not exists free_signup_attribution_pending_idx
  on public.free_signup_attribution(created_at desc)
  where notified_at is null;

alter table public.free_signup_attribution enable row level security;
revoke all on table public.free_signup_attribution from anon, authenticated;

drop trigger if exists free_signup_attribution_touch on public.free_signup_attribution;
create trigger free_signup_attribution_touch before update on public.free_signup_attribution
  for each row execute function public.touch_updated_at();

-- Stores what the /free cookie carried at signup. coalesce, not overwrite: a
-- second signup attempt that arrives without parameters must not erase the
-- attributed click behind the first, which is the same rule the cookie merge
-- follows in lib/marketing/attribution.ts.
create or replace function public.record_free_signup_attribution(
  p_email text,
  p_fbclid text default null,
  p_utm_medium text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.free_signup_attribution as attribution (email, fbclid, utm_medium)
  values (
    lower(btrim(p_email)),
    nullif(btrim(p_fbclid), ''),
    nullif(btrim(p_utm_medium), '')
  )
  on conflict (email) do update
    set fbclid = coalesce(excluded.fbclid, attribution.fbclid),
        utm_medium = coalesce(excluded.utm_medium, attribution.utm_medium);
$$;

-- Claims the conversion event for an email exactly once. Returns null when no
-- attribution was stored (the account did not register through /free) or when
-- the event was already sent. Returning jsonb keeps the update's returned
-- columns unambiguous inside a SQL-language function body.
create or replace function public.claim_free_registration_notice(p_email text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.free_signup_attribution
       set notified_at = now()
     where email = lower(btrim(p_email))
       and notified_at is null
    returning fbclid, utm_medium
  )
  select jsonb_build_object('fbclid', fbclid, 'utm_medium', utm_medium)
  from claimed;
$$;

revoke all on function public.record_free_signup_attribution(text, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_free_registration_notice(text)
  from public, anon, authenticated;
grant execute on function public.record_free_signup_attribution(text, text, text) to service_role;
grant execute on function public.claim_free_registration_notice(text) to service_role;
