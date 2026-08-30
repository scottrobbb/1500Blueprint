-- Browser back/forward never notifies us that a Checkout attempt was abandoned
-- (only Stripe's own hosted "Back" link, via cancel_url, does that). So choosing
-- a different plan while an earlier one is still reserved always hit "busy" --
-- even when the student clearly meant to switch, not resume. To let the checkout
-- route auto-supersede an abandoned reservation for a *different* plan/cadence
-- (while still correctly blocking a same-plan concurrent double-submit), it needs
-- to know which plan/cadence the existing reservation is actually for. Adding
-- plan_code/billing_cadence to the return row exposes that without an extra
-- round trip.
drop function if exists public.claim_billing_checkout_intent(text, boolean, text, text, text);

create or replace function public.claim_billing_checkout_intent(
  p_user_id text,
  p_livemode boolean,
  p_plan_code text,
  p_billing_cadence text,
  p_request_token text
)
returns table(
  decision text,
  reservation_id uuid,
  checkout_expires_at timestamptz,
  stripe_checkout_session_url text,
  plan_code text,
  billing_cadence text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_intent public.billing_checkout_intents%rowtype;
begin
  if p_user_id is null or p_user_id = '' or length(p_user_id) > 128 then
    raise exception 'A valid billing account is required';
  end if;
  if p_plan_code not in ('core', 'max')
    or p_billing_cadence not in ('monthly', 'three_month') then
    raise exception 'The Checkout offer is invalid';
  end if;
  if p_request_token is null
    or p_request_token !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$' then
    raise exception 'A valid Checkout request token is required';
  end if;
  if not exists (
    select 1 from public.users account
    where account.id = p_user_id and account.account_status = 'active'
  ) then
    raise exception 'The active billing account was not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || p_livemode::text, 1500));

  select intent.*
    into v_intent
    from public.billing_checkout_intents intent
   where intent.user_id = p_user_id and intent.livemode = p_livemode
   for update;

  if not found then
    insert into public.billing_checkout_intents (
      user_id, livemode, request_token, plan_code, billing_cadence,
      status, lease_expires_at, checkout_expires_at
    ) values (
      p_user_id, p_livemode, p_request_token, p_plan_code, p_billing_cadence,
      'creating', v_now + interval '5 minutes', v_now + interval '1 hour'
    )
    returning * into v_intent;
    decision := 'claimed';
  elsif v_intent.status in ('completed', 'expired') or v_intent.checkout_expires_at <= v_now then
    update public.billing_checkout_intents intent
       set reservation_id = gen_random_uuid(),
           request_token = p_request_token,
           plan_code = p_plan_code,
           billing_cadence = p_billing_cadence,
           status = 'creating',
           lease_expires_at = v_now + interval '5 minutes',
           checkout_expires_at = v_now + interval '1 hour',
           stripe_checkout_session_id = null,
           stripe_checkout_session_url = null,
           attempts = intent.attempts + 1,
           updated_at = v_now
     where intent.user_id = p_user_id and intent.livemode = p_livemode
    returning intent.* into v_intent;
    decision := 'claimed';
  elsif v_intent.status = 'creating' and v_intent.lease_expires_at <= v_now then
    if v_intent.plan_code = p_plan_code and v_intent.billing_cadence = p_billing_cadence then
      -- Same plan retry: preserve reservation_id so retries share one Stripe
      -- idempotency key and identical expires_at, even if the first network
      -- response was lost.
      update public.billing_checkout_intents intent
         set request_token = p_request_token,
             lease_expires_at = v_now + interval '5 minutes',
             attempts = intent.attempts + 1,
             updated_at = v_now
       where intent.user_id = p_user_id and intent.livemode = p_livemode
      returning intent.* into v_intent;
    else
      -- A different plan after an abandoned attempt: nothing is using this slot
      -- anymore, so start over cleanly for the newly requested plan/cadence.
      update public.billing_checkout_intents intent
         set reservation_id = gen_random_uuid(),
             request_token = p_request_token,
             plan_code = p_plan_code,
             billing_cadence = p_billing_cadence,
             status = 'creating',
             lease_expires_at = v_now + interval '5 minutes',
             checkout_expires_at = v_now + interval '1 hour',
             stripe_checkout_session_id = null,
             stripe_checkout_session_url = null,
             attempts = intent.attempts + 1,
             updated_at = v_now
       where intent.user_id = p_user_id and intent.livemode = p_livemode
      returning intent.* into v_intent;
    end if;
    decision := 'claimed';
  elsif v_intent.plan_code <> p_plan_code or v_intent.billing_cadence <> p_billing_cadence then
    decision := 'busy';
  elsif v_intent.status = 'ready' and v_intent.stripe_checkout_session_url is not null then
    decision := 'ready';
  else
    decision := 'busy';
  end if;

  reservation_id := v_intent.reservation_id;
  checkout_expires_at := v_intent.checkout_expires_at;
  stripe_checkout_session_url := case when decision = 'ready'
    then v_intent.stripe_checkout_session_url else null end;
  plan_code := v_intent.plan_code;
  billing_cadence := v_intent.billing_cadence;
  return next;
end;
$$;

revoke all on function public.claim_billing_checkout_intent(text, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_billing_checkout_intent(text, boolean, text, text, text)
  to service_role;
