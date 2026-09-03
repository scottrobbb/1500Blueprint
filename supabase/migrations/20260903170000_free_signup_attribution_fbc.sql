-- Store Meta's _fbc value alongside the raw click id.
--
-- fbc is what Meta's own pixel writes into the _fbc cookie:
-- fb.1.<click time in ms>.<fbclid>. It is derived, not received -- the proxy
-- builds it when the click lands on /free and stamps it with that moment, so
-- the timestamp has to travel with the click rather than be regenerated when
-- the conversion is reported.
--
-- The raw fbclid column stays. Both are sent, neither replaces the other.

alter table public.free_signup_attribution
  add column if not exists fbc text;

alter table public.free_signup_attribution
  drop constraint if exists free_signup_attribution_fbc_shape_check;
alter table public.free_signup_attribution
  add constraint free_signup_attribution_fbc_shape_check check (
    fbc is null or (fbc ~ '^fb\.1\.[0-9]{1,20}\..+$' and length(fbc) <= 300)
  );

-- Adding a parameter would otherwise leave the old three-argument version in
-- place as an ambiguous overload.
drop function if exists public.claim_free_registration_notice(text, text, text);

create or replace function public.claim_free_registration_notice(
  p_email text,
  p_fbclid text default null,
  p_fbc text default null,
  p_utm_medium text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  insert into public.free_signup_attribution as attribution (
    email,
    fbclid,
    fbc,
    utm_medium,
    notified_at
  )
  values (
    lower(btrim(p_email)),
    nullif(btrim(p_fbclid), ''),
    nullif(btrim(p_fbc), ''),
    nullif(btrim(p_utm_medium), ''),
    now()
  )
  on conflict (email) do update
    -- coalesce, not overwrite: an attempt that arrives without parameters must
    -- not erase the attributed click behind an earlier one, which is the same
    -- rule the cookie merge follows in lib/marketing/attribution.ts. This runs
    -- only for a row that has not been notified yet.
    set fbclid = coalesce(excluded.fbclid, attribution.fbclid),
        fbc = coalesce(excluded.fbc, attribution.fbc),
        utm_medium = coalesce(excluded.utm_medium, attribution.utm_medium),
        notified_at = now()
    -- The guard. A row that has already been notified is left untouched and
    -- returns no row, so the caller sends nothing.
    where attribution.notified_at is null
  returning jsonb_build_object(
    'fbclid', fbclid,
    'fbc', fbc,
    'utm_medium', utm_medium
  );
$$;

revoke all on function public.claim_free_registration_notice(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_free_registration_notice(text, text, text, text) to service_role;
