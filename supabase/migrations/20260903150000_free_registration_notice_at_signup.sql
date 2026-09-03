-- The Free conversion event now fires when the registration completes on the
-- site, not when the verification email is later opened.
--
-- That collapses the two writes into one. Storing the attribution and claiming
-- the conversion used to happen in different requests, on possibly different
-- devices, so the cookie had to be parked against the email address first and
-- read back later. Both now happen in the signup request, while the cookie is
-- in hand, so a single statement does the whole job: it records what the
-- landing page carried and claims the event, and returns nothing at all when
-- an earlier attempt for the same address already claimed it.
--
-- notified_at stays the duplicate guard. A student who submits the signup form
-- twice -- the usual reason being a verification email that has not arrived --
-- sends no second event, and the stored row keeps the attribution that was
-- actually reported rather than being rewritten by the later attempt.

drop function if exists public.claim_free_registration_notice(text);
drop function if exists public.record_free_signup_attribution(text, text, text);

-- Rows are now written already-claimed, so nothing is ever left pending and
-- the partial index has nothing to index.
drop index if exists public.free_signup_attribution_pending_idx;

create or replace function public.claim_free_registration_notice(
  p_email text,
  p_fbclid text default null,
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
    utm_medium,
    notified_at
  )
  values (
    lower(btrim(p_email)),
    nullif(btrim(p_fbclid), ''),
    nullif(btrim(p_utm_medium), ''),
    now()
  )
  on conflict (email) do update
    -- coalesce, not overwrite: an attempt that arrives without parameters must
    -- not erase the attributed click behind an earlier one, which is the same
    -- rule the cookie merge follows in lib/marketing/attribution.ts. This runs
    -- only for a row that has not been notified yet.
    set fbclid = coalesce(excluded.fbclid, attribution.fbclid),
        utm_medium = coalesce(excluded.utm_medium, attribution.utm_medium),
        notified_at = now()
    -- The guard. A row that has already been notified is left untouched and
    -- returns no row, so the caller sends nothing.
    where attribution.notified_at is null
  returning jsonb_build_object('fbclid', fbclid, 'utm_medium', utm_medium);
$$;

revoke all on function public.claim_free_registration_notice(text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_free_registration_notice(text, text, text) to service_role;
