-- One-time purchases never create a subscription or change the legacy plan.
alter table public.billing_checkout_intents
  drop constraint if exists billing_checkout_intents_billing_cadence_check;
alter table public.billing_checkout_intents
  add constraint billing_checkout_intents_billing_cadence_check
  check (billing_cadence in ('monthly', 'three_month', 'one_week')
    and (billing_cadence <> 'one_week' or plan_code = 'max'));

create table public.billing_week_passes (
  stripe_checkout_session_id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  stripe_payment_intent_id text not null unique,
  livemode boolean not null,
  amount_paid integer not null check (amount_paid = 3900),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '168 hours'),
  refunded_at timestamptz,
  check (expires_at = starts_at + interval '168 hours')
);
create index billing_week_passes_user_mode_idx on public.billing_week_passes(user_id, livemode, expires_at);
alter table public.billing_week_passes enable row level security;
revoke all on public.billing_week_passes from public, anon, authenticated;
grant select, insert, update on public.billing_week_passes to service_role;

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
    or p_billing_cadence not in ('monthly', 'three_month', 'one_week')
    or (p_billing_cadence = 'one_week' and p_plan_code <> 'max') then
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
  if p_billing_cadence = 'one_week' and exists (
    select 1 from public.billing_week_passes
    where user_id = p_user_id and livemode = p_livemode
      and refunded_at is null and expires_at > v_now
  ) then
    raise exception 'Weekly access is already active';
  end if;


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

notify pgrst, 'reload schema';
